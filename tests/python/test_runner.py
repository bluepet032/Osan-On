import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from pipeline import runner
from pipeline.config import SourceConfig
from pipeline.models import RawOpportunity


class FakeCollector:
    def __init__(self, count: int | None):
        self.count = count

    def collect(self, now, limit=150):
        if self.count is None:
            raise RuntimeError("요청 실패")
        return [RawOpportunity(
            source_id="wevity", source_name="위비티", source_url=f"https://example.com/{index}",
            title=f"AI 게임 공모전 {index}", recruit_end="2026-12-31", date_kind="exact",
        ) for index in range(self.count)]


def run_once(monkeypatch, output: Path, count: int | None, day: int):
    monkeypatch.setattr(runner, "create_collector", lambda source: FakeCollector(count))
    runner.run_pipeline(output_dir=output, names={"wevity"}, now=datetime(2026, 10, day, 3, tzinfo=ZoneInfo("Asia/Seoul")))
    items = json.loads((output / "sources.json").read_text(encoding="utf-8"))["items"]
    return next(item for item in items if item["source_id"] == "wevity")


def test_previous_collected_count_tracks_the_last_successful_run(monkeypatch, tmp_path: Path):
    output = tmp_path / "data"

    first = run_once(monkeypatch, output, 12, 1)
    second = run_once(monkeypatch, output, 5, 2)
    failed = run_once(monkeypatch, output, None, 3)
    recovered = run_once(monkeypatch, output, 11, 4)

    assert first["previous_collected_count"] is None
    assert second["previous_collected_count"] == 12
    assert failed["previous_collected_count"] == 5
    assert recovered["previous_collected_count"] == 5


def test_facet_coverage_is_recorded_and_kept_as_baseline_through_failures(monkeypatch, tmp_path: Path):
    output = tmp_path / "data"

    first = run_once(monkeypatch, output, 4, 1)
    failed = run_once(monkeypatch, output, None, 2)
    recovered = run_once(monkeypatch, output, 4, 3)

    assert set(first["facet_coverage"]) == {"region", "mode", "fee", "audience", "prize"}
    assert first["previous_facet_coverage"] is None
    assert failed["facet_coverage"] is None
    assert failed["previous_facet_coverage"] == first["facet_coverage"]
    assert recovered["previous_facet_coverage"] == first["facet_coverage"]


def test_recent_deadlines_survive_missing_posts_and_newer_copies_win(monkeypatch, tmp_path: Path):
    records = [RawOpportunity(
        source_id="wevity", source_name="위비티", source_post_id="archive-case",
        source_url="https://example.com/archive-case", title="AI 게임 공모전",
        recruit_end="2026-10-13", date_kind="exact",
    )]

    class Collector:
        def collect(self, now, limit=150):
            return records

    monkeypatch.setattr(runner, "create_collector", lambda source: Collector())
    monkeypatch.setattr(runner, "manual_items", lambda taxonomy, now: [])
    output = tmp_path / "data"
    kst = ZoneInfo("Asia/Seoul")
    first, _ = runner.run_pipeline(output_dir=output, names={"wevity"}, now=datetime(2026, 10, 13, 3, tzinfo=kst))
    old_id, first_seen, last_seen = first[0].id, first[0].first_seen_at, first[0].last_seen_at

    records.clear()
    runner.run_pipeline(output_dir=output, names={"wevity"}, now=datetime(2026, 10, 14, 3, tzinfo=kst))
    closed = json.loads((output / "closed.json").read_text(encoding="utf-8"))["items"]
    assert len(closed) == 1
    assert (closed[0]["id"], closed[0]["status"], closed[0]["d_day"]) == (old_id, "closed", -1)
    assert (closed[0]["first_seen_at"], closed[0]["last_seen_at"]) == (first_seen, last_seen)

    records.append(RawOpportunity(
        source_id="wevity", source_name="위비티", source_post_id="archive-case",
        source_url="https://example.com/archive-case", title="AI 게임 공모전",
        recruit_end="2026-10-30", date_kind="exact",
    ))
    reopened, _ = runner.run_pipeline(output_dir=output, names={"wevity"}, now=datetime(2026, 10, 15, 3, tzinfo=kst))
    assert len(reopened) == 1
    assert reopened[0].id == old_id and reopened[0].recruit_end == "2026-10-30"
    assert json.loads((output / "closed.json").read_text(encoding="utf-8"))["items"] == []

    records.clear()
    expired, _ = runner.run_pipeline(output_dir=output, names={"wevity"}, now=datetime(2027, 2, 1, 3, tzinfo=kst))
    assert expired == []


def test_capped_source_keeps_open_notices_beyond_the_limit(monkeypatch, tmp_path: Path):
    # Day 1 and 2 return exactly `limit` items (the list was cut off); day 3 returns fewer (the full list).
    listed = {1: ["a", "b", "undated"], 2: ["c", "d", "e"], 3: ["e"]}

    class Collector:
        def collect(self, now, limit=150):
            return [RawOpportunity(
                source_id="wevity", source_name="위비티", source_post_id=key,
                source_url=f"https://example.com/{key}", title=f"AI 게임 공모전 {key}",
                recruit_end=None if key == "undated" else "2026-12-31",
                date_kind="unknown" if key == "undated" else "exact",
            ) for key in listed[now.day]]

    monkeypatch.setattr(runner, "create_collector", lambda source: Collector())
    monkeypatch.setattr(runner, "manual_items", lambda taxonomy, now: [])
    output = tmp_path / "data"
    kst = ZoneInfo("Asia/Seoul")
    run = lambda day: runner.run_pipeline(output_dir=output, names={"wevity"}, limit=3, now=datetime(2026, 10, day, 3, tzinfo=kst))[0]
    first = {item.title: item.first_seen_at for item in run(1)}

    capped = {item.title: item.first_seen_at for item in run(2)}
    assert set(capped) == {f"AI 게임 공모전 {key}" for key in "abcde"}
    assert capped["AI 게임 공모전 a"] == first["AI 게임 공모전 a"]

    full = run(3)
    assert [item.title for item in full] == ["AI 게임 공모전 e"]


def test_source_limit_comes_from_config_unless_the_run_overrides_it(monkeypatch, tmp_path: Path):
    received = []

    class Collector:
        def collect(self, now, limit=150):
            received.append(limit)
            return [RawOpportunity(
                source_id="wevity", source_name="위비티", source_post_id=f"{now.day}-{index}",
                source_url=f"https://example.com/{now.day}-{index}", title=f"AI 게임 공모전 {now.day}-{index}",
                recruit_end="2026-12-31", date_kind="exact",
            ) for index in range(limit)]

    source = SourceConfig("wevity", "위비티", "aggregate", 40, "fast", "html", "https://example.com", "https://example.com", limit=2)
    monkeypatch.setattr(runner, "load_sources", lambda: ([source], []))
    monkeypatch.setattr(runner, "create_collector", lambda source: Collector())
    monkeypatch.setattr(runner, "manual_items", lambda taxonomy, now: [])
    output = tmp_path / "data"
    kst = ZoneInfo("Asia/Seoul")
    runner.run_pipeline(output_dir=output, now=datetime(2026, 10, 1, 3, tzinfo=kst))
    second, _ = runner.run_pipeline(output_dir=output, now=datetime(2026, 10, 2, 3, tzinfo=kst))
    runner.run_pipeline(output_dir=output, limit=1, now=datetime(2026, 10, 3, 3, tzinfo=kst))

    assert received == [2, 2, 1]
    # Day 2 filled the source's own limit, so day 1's unseen open notices were kept.
    assert len(second) == 4


def test_archived_notices_still_obey_manual_exclusions(monkeypatch, tmp_path: Path):
    run_once(monkeypatch, tmp_path / "data", 1, 1)
    manual = tmp_path / "manual"
    manual.mkdir()
    (manual / "exclusions.yml").write_text("source_urls: ['https://example.com/0']\n", encoding="utf-8")
    (manual / "overrides.yml").write_text("items: []\n", encoding="utf-8")
    from pipeline.overrides import apply_overrides

    monkeypatch.setattr(runner, "apply_overrides", lambda items, now: apply_overrides(items, manual_dir=manual, now=now))
    monkeypatch.setattr(runner, "manual_items", lambda taxonomy, now: [])
    monkeypatch.setattr(runner, "create_collector", lambda source: FakeCollector(0))
    items, _ = runner.run_pipeline(output_dir=tmp_path / "data", names={"wevity"}, now=datetime(2027, 1, 1, tzinfo=ZoneInfo("Asia/Seoul")))
    assert items == []


def test_partial_run_keeps_untouched_source_status(monkeypatch, tmp_path: Path):
    output = tmp_path / "data"
    previous = run_once(monkeypatch, output, 4, 1)
    assert previous["new_count"] == 4
    monkeypatch.setattr(runner, "create_collector", lambda source: FakeCollector(0))
    _, statuses = runner.run_pipeline(output_dir=output, names={"dev_event"}, now=datetime(2026, 10, 2, tzinfo=ZoneInfo("Asia/Seoul")))
    current = next(status for status in statuses if status.source_id == "wevity")
    assert current.to_dict() == previous
