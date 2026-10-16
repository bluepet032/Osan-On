from datetime import datetime
from zoneinfo import ZoneInfo

from pipeline.collectors.html import StructuredHtmlCollector, parse_date
from pipeline.config import SourceConfig
from pipeline.http import Response


NOW = datetime(2026, 7, 30, tzinfo=ZoneInfo("Asia/Seoul"))

class FakeClient:
    def __init__(self, pages): self.pages = pages
    def get(self, url, headers=None):
        return Response(url, 200, self.pages[url], "text/html")

    def post_json(self, url, payload, headers=None):
        return Response(url, 200, self.pages[url], "application/json")


def config(source_id="sample", mode="html"):
    return SourceConfig(source_id, "샘플", "specialist", 60, "fast", mode, "https://example.com/list", "https://example.com", True)


def test_json_ld_collector_contract():
    markup = '''<script type="application/ld+json">{"@type":"Event","name":"AI 게임 해커톤","url":"/event/1","organizer":{"name":"개발자협회"},"startDate":"2026-08-01","endDate":"2026-08-31","description":"AI 게임 개발자를 위한 해커톤입니다."}</script>'''
    items = StructuredHtmlCollector(config(), FakeClient({"https://example.com/list": markup})).collect(NOW)
    assert items[0].title == "AI 게임 해커톤"
    assert items[0].recruit_end == "2026-08-31"


def test_detail_title_removes_source_suffix():
    list_markup = '<a href="/event/1">AI 게임 해커톤 모집</a>'
    detail_markup = '<meta property="og:title" content="AI 게임 해커톤 | 샘플"><meta name="description" content="AI 게임 개발자를 위한 해커톤 행사입니다.">2026-08-01 ~ 2026-08-31'
    client = FakeClient({"https://example.com/list": list_markup, "https://example.com/event/1": detail_markup})
    item = StructuredHtmlCollector(config(), client).collect(NOW)[0]
    assert item.title == "AI 게임 해커톤"


def test_navigation_link_is_not_collected_as_an_opportunity():
    markup = '<a href="/guide">대회 참가 방법 안내</a>'
    collector = StructuredHtmlCollector(config(), FakeClient({"https://example.com/list": markup}))
    try:
        collector.collect(NOW)
    except Exception as error:
        assert "공고 링크" in str(error)
    else:
        raise AssertionError("탐색 링크가 공고로 수집되었습니다")


def test_generic_meta_title_falls_back_to_specific_list_title():
    list_markup = '<a href="/notice/42">AI 게임 제작지원 사업공고</a>'
    detail_markup = '<meta property="og:title" content="사업공고 | 사업공고 | 알림마당"><meta name="description" content="AI 게임 제작팀 지원사업입니다.">2026-08-01 ~ 2026-08-31'
    collector = StructuredHtmlCollector(config(), FakeClient({
        "https://example.com/list": list_markup,
        "https://example.com/notice/42": detail_markup,
    }))
    item = collector.collect(NOW)[0]
    assert item.title == "AI 게임 제작지원 사업공고"


def test_invalid_calendar_date_is_rejected():
    assert parse_date("2026-02-30") is None


def test_detail_dates_prefer_recruitment_label_over_first_page_date():
    from pipeline.collectors.html import recruit_dates_from_text

    text = "등록일 2026.09.01 조회수 120 행사일 2026-11-20 접수기간 : 2026.10.06(월) 10:00 ~ 10.20(월) 18:00"
    assert recruit_dates_from_text(text) == ("2026-10-06", "2026-10-20")


def test_detail_dates_handle_year_rollover_and_deadline_only_labels():
    from pipeline.collectors.html import recruit_dates_from_text

    assert recruit_dates_from_text("모집기간 2026.12.20 ~ 01.10") == ("2026-12-20", "2027-01-10")
    assert recruit_dates_from_text("게시일 2026.09.01 / 신청마감 : 2026년 10월 31일") == (None, "2026-10-31")


def test_detail_dates_drop_implausible_unlabeled_periods():
    from pipeline.collectors.html import recruit_dates_from_text

    assert recruit_dates_from_text("수정일 2026.10.01 최초 작성 2024.03.02") == (None, None)
    assert recruit_dates_from_text("작성 2026.01.01 행사 2027.12.31") == (None, None)
    assert recruit_dates_from_text("2026.10.01 ~ 2026.10.15 진행") == ("2026-10-01", "2026-10-15")


def test_table_collectors_keep_angle_brackets_that_are_part_of_titles():
    # All table collectors share this helper.
    from pipeline.collectors.html import tag_text

    markup = '<a href="#">[공고] 종로아이들극장 &lt;2027년도 어린이·가족공연 작품 공모&gt;</a>'
    unescaped = '<p><a href="#">[한국연극인복지재단] <2026 프로젝트 워크숍 ; 이음과 과정> 배우 공모</a></p>'
    assert tag_text(markup) == "[공고] 종로아이들극장 <2027년도 어린이·가족공연 작품 공모>"
    assert tag_text(unescaped) == "[한국연극인복지재단] <2026 프로젝트 워크숍 ; 이음과 과정> 배우 공모"
