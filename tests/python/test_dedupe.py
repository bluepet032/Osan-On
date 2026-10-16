from datetime import datetime
from zoneinfo import ZoneInfo

from pipeline.config import load_taxonomy
from pipeline.dedupe import deduplicate
from pipeline.models import RawOpportunity
from pipeline.normalize import normalize


NOW = datetime(2026, 7, 30, tzinfo=ZoneInfo("Asia/Seoul"))


def make(source_id: str, url: str, priority: int, *, title: str = "2026 인디게임 제작지원 공모", organizer: str = "경기콘텐츠진흥원"):
    return normalize(RawOpportunity(
        source_id=source_id,
        source_name=source_id,
        source_url=url,
        title=title,
        organizer=organizer,
        summary="인디게임 개발팀을 대상으로 제작비를 지원하는 사업입니다.",
        source_kind="official" if priority > 80 else "aggregate",
        source_priority=priority,
        recruit_end="2026-08-31",
        date_kind="exact",
        collected_at=NOW.isoformat(),
    ), load_taxonomy(), NOW)


def test_duplicate_sources_merge_and_official_wins():
    merged = deduplicate([
        make("aggregate", "https://example.com/repost", 40),
        make("official", "https://official.example.com/post", 100),
    ])
    assert len(merged) == 1
    assert merged[0].source_name == "official"
    assert len(merged[0].sources) == 2


def test_duplicate_merge_keeps_score_and_decision_consistent():
    preferred = make("official", "https://official.example.com/post", 100)
    secondary = make("aggregate", "https://example.com/repost", 40)
    preferred.relevance.score = 40
    preferred.relevance.decision = "exclude"
    secondary.relevance.score = 75
    secondary.relevance.decision = "publish"

    [merged] = deduplicate([preferred, secondary])

    assert merged.relevance.score == 75
    assert merged.relevance.decision == "publish"


def test_cross_site_posts_merge_at_ninety_percent_title_similarity():
    merged = deduplicate([
        make("wevity", "https://wevity.example.com/42", 40, organizer="주최기관 미상"),
        make("official", "https://official.example.com/42", 100, title="2026 인디게임 제작지원 공모전", organizer="경기콘텐츠진흥원"),
    ])

    assert len(merged) == 1
    assert {source.source_id for source in merged[0].sources} == {"wevity", "official"}


def test_same_stable_id_merges_even_when_other_fields_diverge():
    original = make("fixture", "https://example.com/original", 40)
    repeated = make(
        "fixture",
        "https://example.com/changed-url",
        40,
        title="제목과 일정이 크게 변경된 공고",
        organizer="다른 표기 기관",
    )
    repeated.id = original.id
    repeated.recruit_end = "2026-12-31"
    repeated.dedupe_key = "completely-different"

    merged = deduplicate([original, repeated])

    assert len(merged) == 1
    assert len(merged[0].sources) == 2


def test_similar_tracks_from_one_source_with_distinct_post_ids_stay_separate():
    def track(post_id: str, title: str):
        return normalize(RawOpportunity(
            source_id="dacon", source_name="DACON", source_url=f"https://dacon.io/competitions/official/{post_id}/overview/description",
            source_post_id=post_id, title=title, organizer="DACON", source_kind="specialist", source_priority=60,
            recruit_end="2026-07-15", date_kind="exact", collected_at=NOW.isoformat(),
        ), load_taxonomy(), NOW)

    merged = deduplicate([
        track("236693", "2026 AI·SW중심대학 디지털 경진대회 : SW부문"),
        track("236694", "2026 AI·SW중심대학 디지털 경진대회 : AI부문"),
    ])

    assert len(merged) == 2


def test_identically_titled_reposts_on_one_source_still_merge():
    def post(post_id: str, end: str):
        return normalize(RawOpportunity(
            source_id="linkareer", source_name="링커리어", source_url=f"https://linkareer.com/activity/{post_id}",
            source_post_id=post_id, title="2026 SNU X Croche AI 앱 해커톤", organizer="SNU", source_kind="aggregate",
            source_priority=40, recruit_end=end, date_kind="exact", collected_at=NOW.isoformat(),
        ), load_taxonomy(), NOW)

    assert len(deduplicate([post("353364", "2026-10-20"), post("353594", "2026-10-21")])) == 1


def test_merge_keeps_an_item_published_in_another_field_tab():
    def video(source_id: str, url: str, priority: int):
        return normalize(RawOpportunity(
            source_id=source_id, source_name=source_id, source_url=url, title="2026 남원시 영상 공모전",
            organizer="남원시", source_kind="aggregate", source_priority=priority,
            recruit_end="2026-10-31", date_kind="exact", collected_at=NOW.isoformat(),
        ), load_taxonomy(), NOW)

    merged = deduplicate([video("linkareer", "https://linkareer.com/activity/1", 40), video("wevity", "https://wevity.com/1", 40)])

    assert len(merged) == 1
    assert merged[0].domain == "design_media"
    assert merged[0].relevance.decision == "publish"


def test_merge_does_not_restore_it_from_a_mixed_photo_category():
    items = []
    for source_id, category in (
        ("wevity", "광고/마케팅, 영상/UCC/사진, 웹/모바일/IT, 예체능/미술/음악"),
        ("linkareer", "사진/영상/UCC"),
    ):
        items.append(normalize(RawOpportunity(
            source_id=source_id, source_name=source_id, source_url=f"https://{source_id}.example.com/photo",
            title="LG 대국민 미소 사진 공모전", organizer="LG", original_category=category,
            body_text=category, recruit_end="2026-10-19", date_kind="exact",
        ), load_taxonomy(), NOW))
    [merged] = deduplicate(items)
    assert merged.domain == "design_media" and merged.field_tags == ["사진"]
    assert merged.relevance.decision == "publish" and merged.relevance.score < 70
    assert len(merged.sources) == 2
