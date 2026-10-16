from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from pipeline.classification import classify
from pipeline.collectors.base import CollectorStructureError
from pipeline.collectors.gcon import GconCollector
from pipeline.config import SourceConfig, load_taxonomy
from pipeline.http import Response


NOW = datetime(2026, 10, 13, tzinfo=ZoneInfo("Asia/Seoul"))
CONFIG = SourceConfig("gcon", "경기콘텐츠진흥원", "official", 100, "slow", "html",
                      "https://www.gcon.or.kr/gcon/business/gconNotice/list.do?menuNo=200061",
                      "https://www.gcon.or.kr/")
DETAIL_URL = "https://www.gcon.or.kr/gcon/business/gconNotice/view.do?pbancSrnm=11235&menuNo=200061&pageIndex=1"
TITLE = "경기도 출판물 제작지원 참가기업 모집"
DESCRIPTION = "도내 출판기업의 도서 제작과 해외 판로 개척을 지원하며 선정된 기업에 제작비와 수출 상담 기회를 제공합니다."

# GCON's public notice template uses #content, dt/dd information tables and
# .bd-view-nav inside the content container for adjacent, unrelated notices.
DETAIL = """<html><head>
<meta property="og:title" content="사업공고 | 사업공고 | 알림마당">
<meta name="description" content="사업소개 게임 AI 데이터 주관기관 사업 안내">
</head><body>
<header><nav>기관 사업소개 2026년 지원사업 안내 게임 AI 데이터</nav></header>
<div id="content">
  <div class="box-gray"><h2 class="none">경기도 출판물 제작지원 참가기업 모집</h2>
    <dl class="v-bar"><dt>등록일</dt><dd>2026.10.01</dd></dl>
    <dl class="v-bar"><dt>담당부서</dt><dd>출판지원팀</dd></dl>
  </div>
  <div class="flex-row gap0"><div class="dl-table">
    <dl><dt>접수기간</dt><dd>2026년 10월 02일 15시 30분 ~ 2026년 10월 14일 15시 00분</dd></dl>
    <dl><dt>모집조건</dt><dd><span class="v-bar">경기도 기업</span></dd></dl>
  </div><h3>사업개요</h3><div class="dl-table">
    <dl><dt>사업기간</dt><dd>2026년 09월 01일 ~ 2026년 12월 31일</dd></dl>
    <dl><dt>사업내용</dt><dd>DESCRIPTION</dd></dl>
    ORGANIZER
    <dl><dt>지원내용</dt><dd class="userWt">도서 제작비 지원<br/>수출 상담 기회 제공</dd></dl>
  </div></div>
  <div class="bsbody"><h3>모집개요</h3><div class="dl-table">
    <dl><dt>모집기간</dt><dd>2026년 10월 02일 ~ 2026년 10월 14일</dd></dl>
    <dl><dt>기타안내사항</dt><dd>선정 이후 타 기관 유사사업과 중복 지원은 제한됩니다.</dd></dl>
  </div></div>
  <div class="bd-view-nav"><dl><dt>이전글</dt><dd>AI 게임 데이터 해커톤 2026.10.20 ~ 2026.11.30</dd></dl></div>
</div>
<footer>유관기관 게임 AI 데이터 사업소개</footer></body></html>""".replace("DESCRIPTION", DESCRIPTION)


class FakeClient:
    def get(self, url, headers=None):
        if "list.do" in url:
            return Response(url, 200, f'<tr><td><a href="{DETAIL_URL}">{TITLE}</a></td><td>접수중</td></tr>', "text/html")
        return Response(url, 200, DETAIL.replace("ORGANIZER", ""), "text/html")


def test_gcon_collect_excludes_navigation_and_preserves_notice_dates():
    item = GconCollector(CONFIG, FakeClient()).collect(NOW, 1)[0]
    assert item.organizer == "경기콘텐츠진흥원"
    assert item.title == TITLE
    assert item.summary == DESCRIPTION
    assert item.source_post_id == "11235"
    assert item.source_url == DETAIL_URL
    assert (item.recruit_start, item.recruit_end, item.date_kind) == ("2026-10-02", "2026-10-14", "exact")
    assert item.location == "경기"
    assert item.eligibility == ""
    assert "수출 상담 기회 제공" in item.benefits
    assert "타 기관 유사사업" in item.body_text
    for unrelated in ("사업소개", "이전글", "AI", "게임", "데이터"):
        assert unrelated not in item.body_text
        assert unrelated not in item.summary
        assert unrelated not in item.organizer
    _, fields, _, relevance, _ = classify(item, load_taxonomy())
    assert fields == []
    assert relevance.decision == "exclude"


@pytest.mark.parametrize("label", ["주최", "주관", "운영기관"])
def test_gcon_organizer_comes_only_from_notice_information(label):
    markup = DETAIL.replace("ORGANIZER", f'<dl><dt>{label}</dt><dd><span>경기도</span> 출판협회</dd></dl>')
    item = GconCollector(CONFIG)._detail_item(markup, DETAIL_URL, TITLE, NOW)
    assert item.organizer == "경기도 출판협회"
    assert (item.recruit_start, item.recruit_end) == ("2026-10-02", "2026-10-14")


def test_gcon_summary_uses_support_information_when_business_description_is_missing():
    markup = DETAIL.replace("ORGANIZER", "").replace(f"<dl><dt>사업내용</dt><dd>{DESCRIPTION}</dd></dl>", "")
    item = GconCollector(CONFIG)._detail_item(markup, DETAIL_URL, TITLE, NOW)
    assert item.summary == "도서 제작비 지원 수출 상담 기회 제공"


def test_gcon_missing_notice_container_is_a_structure_error():
    with pytest.raises(CollectorStructureError):
        GconCollector(CONFIG)._detail_item("<nav>게임 AI 데이터 기관 사업소개</nav>", DETAIL_URL, TITLE, NOW)
