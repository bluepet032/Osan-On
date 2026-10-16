from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from pipeline.config import load_taxonomy
from pipeline.dedupe import deduplicate
from pipeline.models import RawOpportunity
from pipeline.normalize import normalize
from pipeline.overrides import apply_overrides, manual_items


def test_manual_force_publish_and_exclusion(tmp_path: Path):
    (tmp_path / "opportunities.yml").write_text('''schema_version: 1
items:
  - id: manual-one
    title: 자유주제 디지털 콘텐츠 공모전
    source_url: https://example.com/manual
    organizer: 테스트기관
    summary: 게임 형태로 출품 가능한 자유주제 디지털 콘텐츠 공모전입니다.
    recruit_end: '2026-08-31'
    date_kind: exact
    force_publish: true
''', encoding="utf-8")
    (tmp_path / "overrides.yml").write_text("schema_version: 1\nitems: []\n", encoding="utf-8")
    (tmp_path / "exclusions.yml").write_text("schema_version: 1\nids: []\nsource_urls: []\n", encoding="utf-8")
    now = datetime(2026, 7, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    items = manual_items(load_taxonomy(), now, tmp_path)
    assert items[0].relevance.decision == "publish"
    assert apply_overrides(items, tmp_path) == items


def merged_item(now: datetime):
    """One notice listed by a high-priority source and a low-priority source, merged into one."""

    raws = [RawOpportunity(
        source_id=source_id, source_name=source_id, source_url=f"https://{source_id}.example/post/1",
        source_priority=priority, title="AI 게임 개발 공모전", application_url="https://apply.example/1",
        recruit_end="2026-08-31", date_kind="exact",
    ) for source_id, priority in (("official", 100), ("aggregate", 40))]
    [item] = deduplicate([normalize(raw, load_taxonomy(), now) for raw in raws])
    assert item.source_url == "https://official.example/post/1"
    return item


def test_exclusion_matches_any_merged_source_url_as_pasted(tmp_path: Path):
    now = datetime(2026, 7, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    (tmp_path / "exclusions.yml").write_text("source_urls: ['https://AGGREGATE.example/post/1/']\n", encoding="utf-8")

    assert apply_overrides([merged_item(now)], tmp_path, now) == []


def test_override_matches_any_merged_source_url_as_pasted(tmp_path: Path):
    now = datetime(2026, 7, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    (tmp_path / "overrides.yml").write_text("items:\n  - source_url: https://aggregate.example/post/1/\n    title: 고친 제목\n", encoding="utf-8")

    [result] = apply_overrides([merged_item(now)], tmp_path, now)

    assert result.title == "고친 제목"


def test_override_recalculates_deadline_and_review_score(tmp_path: Path):
    now = datetime(2026, 7, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    item = normalize(RawOpportunity(
        source_id="test",
        source_name="테스트",
        source_url="https://example.com/item",
        title="AI 게임 개발 공모전",
        summary="대학생 개발팀이 AI 게임을 제작해 출품하는 소프트웨어 공모전입니다.",
        recruit_end="2026-08-31",
        date_kind="exact",
    ), load_taxonomy(), now)
    (tmp_path / "overrides.yml").write_text('''schema_version: 1
items:
  - id: ''' + item.id + '''
    recruit_end: '2026-07-30'
    force_review: true
''', encoding="utf-8")
    (tmp_path / "exclusions.yml").write_text("schema_version: 1\nids: []\nsource_urls: []\n", encoding="utf-8")

    [result] = apply_overrides([item], tmp_path, now)

    assert result.status == "today"
    assert result.d_day == 0
    assert 50 <= result.relevance.score < 70
    assert result.relevance.decision == "review"
