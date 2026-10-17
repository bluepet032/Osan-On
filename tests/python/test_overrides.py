from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

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
    items = manual_items(now, tmp_path)
    assert items[0].relevance.decision == "publish"
    assert apply_overrides(items, tmp_path) == items


def merged_item(now: datetime):
    """One notice listed by a high-priority source and a low-priority source, merged into one."""

    raws = [RawOpportunity(
        source_id=source_id, source_name=source_id, source_url=f"https://{source_id}.example/post/1",
        source_priority=priority, title="AI 게임 개발 공모전", application_url="https://apply.example/1",
        recruit_end="2026-08-31", date_kind="exact",
    ) for source_id, priority in (("official", 100), ("aggregate", 40))]
    [item] = deduplicate([normalize(raw, now) for raw in raws])
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
    ), now)
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


def test_manual_benefit_sets_jurisdiction_and_conditions(tmp_path: Path):
    (tmp_path / "opportunities.yml").write_text('''schema_version: 1
items:
  - id: osan-manual
    title: 오산시 청년 월세 지원
    source_url: https://example.com/osan
    organizer: 경기도 오산시
    summary: 오산시에 사는 무주택 청년의 월세를 지원합니다.
    date_kind: ongoing
    jurisdiction: osan
    conditions: {codes: [JA0412], age_min: 19, age_max: 39}
''', encoding="utf-8")
    now = datetime(2026, 10, 16, tzinfo=ZoneInfo("Asia/Seoul"))

    [item] = manual_items(now, tmp_path)

    assert item.jurisdiction == "osan"
    assert item.conditions == {"codes": ["JA0412"], "age_min": 19, "age_max": 39}


def test_override_corrects_application_wording(tmp_path: Path):
    # A report that the period is wrong is fixed by patching the wording shown on the page.
    now = datetime(2026, 7, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    (tmp_path / "overrides.yml").write_text("items:\n  - source_url: https://official.example/post/1\n    apply_period: 매년 3월·9월 모집\n", encoding="utf-8")

    [result] = apply_overrides([merged_item(now)], tmp_path, now)

    assert result.apply_period == "매년 3월·9월 모집"
    # The old August deadline no longer holds, so it must not keep the D-day or close the item.
    assert (result.recruit_start, result.recruit_end, result.date_kind, result.status) == (None, None, "inquiry", "unknown")


def test_override_of_ongoing_wording_reads_as_ongoing(tmp_path: Path):
    now = datetime(2026, 7, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    patch = "items:\n  - source_url: https://official.example/post/1\n    apply_period: 상시 접수\n"
    (tmp_path / "overrides.yml").write_text(patch, encoding="utf-8")

    [result] = apply_overrides([merged_item(now)], tmp_path, now)

    assert (result.recruit_end, result.date_kind, result.status) == (None, "ongoing", "ongoing")


def test_override_keeps_dates_patched_with_the_wording(tmp_path: Path):
    now = datetime(2026, 7, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    patch = (
        "items:\n  - source_url: https://official.example/post/1\n    apply_period: 2026.9.1 ~ 2026.9.30\n"
        "    recruit_end: '2026-09-30'\n    date_kind: exact\n"
    )
    (tmp_path / "overrides.yml").write_text(patch, encoding="utf-8")

    [result] = apply_overrides([merged_item(now)], tmp_path, now)

    assert (result.recruit_end, result.date_kind, result.status) == ("2026-09-30", "exact", "open")


def test_the_published_exclusions_drop_the_gov24_test_service():
    # 정부24 lists "온라인 신청 시연 테스트(운영)", a 행정안전부 placeholder, among real services.
    now = datetime(2026, 10, 17, tzinfo=ZoneInfo("Asia/Seoul"))
    test_service = normalize(RawOpportunity(
        source_id="gov24", source_name="정부24", source_url="https://www.gov.kr/portal/rcvfvrSvc/dtlEx/174100000034",
        title="온라인 신청 시연 테스트(운영)", date_kind="ongoing",
    ), now)

    assert apply_overrides([test_service], now=now) == []
