"""Facet extraction cases taken from real collected titles and fields (2026-10)."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from pipeline.classification import classify
from pipeline.config import load_taxonomy
from pipeline.facets import extract_facets, facet_coverage, parse_manwon, regions_from_location, regions_from_title
from pipeline.models import RawOpportunity
from pipeline.normalize import normalize


def raw(**values) -> RawOpportunity:
    base = dict(source_id="test", source_name="테스트", source_url="https://example.com/1", title="테스트 공고")
    base.update(values)
    return RawOpportunity(**base)


@pytest.mark.parametrize(("title", "expected"), [
    ("[경남ㆍ부산ㆍ울산] Claude를 활용한 웹서비스 아키텍처 개발 과정 교육생 모집 안내", ["경남", "부산", "울산"]),
    ("[전국] 2026년 ICT융합산업보안 인력양성 교육생 모집", ["전국"]),
    ("[서울] 2026년 하반기 중장년 소상공인 디지털 전환지원 사업 모집 공고", ["서울"]),
    ("[경기] 부천시 2026년 공공배달앱 배달특급 개별 가맹점 홍보물 제작 지원 공고", ["경기"]),
    ("[제주특별자치도] 2026 창업 지원사업", ["제주"]),
    ("[전남광주] 2026년 전라남도 사회적경제 청년 창업 아이디어 경진대회", ["전남", "광주"]),
    ("[대구경북첨단의료산업진흥재단] 2026 지원사업", []),
    ("[부산 동구청] 북항 상어 캐릭터 디자인 공모전", []),
    ("[공고] 종로아이들극장 <2027년도 어린이·가족공연 작품 공모>", []),
    ("[연장 공고] 2026 업사이클 브릭아트 공모전", []),
    ("2026 서울영상공모전 <서울 밤로그>", []),
])
def test_regions_come_only_from_a_leading_bracket_of_region_names(title, expected):
    assert regions_from_title(title) == expected


@pytest.mark.parametrize(("location", "expected"), [
    ("서울 강남구", ["서울"]),
    ("충남", ["충남"]),
    ("전국", ["전국"]),
    ("부산광역시 해운대구", ["부산"]),
    ("경기, 서울", ["경기", "서울"]),
    ("None", []),
    ("", []),
    ("협력 : ( 재 ) 서울문화재단 서울", []),
    ("광주광역시", ["광주"]),
])
def test_regions_from_location_fields(location, expected):
    assert regions_from_location(location) == expected


@pytest.mark.parametrize(("category", "mode", "fee", "regions"), [
    ("오프라인(서울 서초구), 무료, 세미나, AI, 기술일반", "offline", "free", ["서울"]),
    ("온라인, 무료, 대회, AI", "online", "free", []),
    ("온라인, 오프라인(부산), 무료, 대회, 기술일반", "hybrid", "free", ["부산"]),
    ("온라인, 유료, 교육", "online", "paid", []),
    ("세미나, AI", "", "unknown", []),
])
def test_dev_event_classification_line(category, mode, fee, regions):
    facets = extract_facets(raw(title="개발자 행사", original_category=category, source_id="dev_event"))
    assert (facets.mode, facets.fee, facets.regions) == (mode, fee, regions)


@pytest.mark.parametrize(("title", "mode"), [
    ("[온라인] AI 활용 실무 세미나", "online"),
    ("계속되는 기업 보안 위협, 실제 사례와 탐지 전략 웨비나", "online"),
    ("2026 창업 지원사업 온라인 설명회", "online"),
    ("온·오프라인 동시 진행 개발자 컨퍼런스", "hybrid"),
    ("(오프라인) 판교 데모데이", "offline"),
    ("온라인셀러·구매대행 세무 특강", ""),
    ("온라인 쇼핑몰 입점 지원사업", ""),
    ("모두의 보스 온라인 가요제", ""),
])
def test_attendance_needs_an_explicit_marker(title, mode):
    assert extract_facets(raw(title=title)).mode == mode


def test_collector_supplied_mode_and_fee_win():
    facets = extract_facets(raw(title="[온라인] 행사", mode="offline", fee="paid", original_category="무료"))
    assert (facets.mode, facets.fee) == ("offline", "paid")


@pytest.mark.parametrize(("title", "fee"), [
    ("무료 특강: 생성형 AI 입문", "free"),
    ("AI 부트캠프 (참가비 무료)", "free"),
    ("데이터 분석 교육 참가비 30,000원", "paid"),
    ("[유료] 실전 마케팅 클래스", "paid"),
    ("무료배송 이벤트 공모전", "unknown"),
    ("2026 대학생 AI 경진대회", "unknown"),
])
def test_fee_markers(title, fee):
    assert extract_facets(raw(title=title)).fee == fee


@pytest.mark.parametrize(("text", "manwon"), [
    ("300만원", 300),
    ("500만 원", 500),
    ("1,500만원", 1500),
    ("팀당 100~150만원", 150),
    ("2억원", 20000),
    ("1억 2천만원", 12000),
    ("5천만원", 5000),
    ("초등 50만원, 중고등 100만원", 100),
    ("갤럭시탭S11", None),
])
def test_parse_manwon(text, manwon):
    assert parse_manwon(text) == manwon


@pytest.mark.parametrize(("fields", "manwon"), [
    ({"benefits": "상금 300만원"}, 300),
    ({"benefits": "상금 2000000"}, 200),
    ({"benefits": "상금 10000000"}, 1000),
    ({"benefits": "상금 1000만원"}, 1000),
    ({"benefits": "상금 30만원(지역상품권)"}, 30),
    ({"benefits": "상금 갤럭시탭S11"}, 0),
    ({"title": "[제주소통협력센터X제주랩스] 2026 새활용 리메이커톤 참가자 모집 (총 상금 250만원)"}, 250),
    ({"title": "2026 창업 지원사업 (최대 2,000만원 지원)"}, None),
    ({"benefits": "지원항목 해외 진출 지원 최대 3,000만원"}, None),
    ({"summary": "씽굿 공모 분야: 대회 · 상금 500만원"}, 500),
    ({"title": "AI 공모전"}, None),
])
def test_prize_requires_the_word_prize(fields, manwon):
    assert extract_facets(raw(**fields)).prize_manwon == manwon


def audiences(**fields):
    return classify(raw(**fields), load_taxonomy())[2]


def test_new_audiences_from_stated_eligibility():
    assert "누구나" in audiences(eligibility="대상 제한 없음")
    assert set(audiences(eligibility="대학생, 직장인/일반인")) >= {"대학생", "일반인"}
    assert "청소년" in audiences(eligibility="어린이, 초등학생, 중학생, 고등학생, 동 연령대 청소년")
    assert "청소년" in audiences(title="제2회 강남구 세계청소년 백일장")


def test_audiences_are_not_read_from_page_body_text():
    # GCON pages mention 청년·개발자 in menus and other notices; a company matching event got both.
    tags = audiences(title="2026년 경기게임커넥트 비즈매칭 참가사 모집", body_text="사이트 메뉴 누구나 청소년 일반인 청년 개발자 대학생")
    assert tags == []


def test_facet_coverage_counts_items_that_state_each_fact():
    taxonomy = load_taxonomy()
    now = datetime(2026, 10, 7, tzinfo=ZoneInfo("Asia/Seoul"))
    items = [
        normalize(raw(source_url="https://example.com/1", title="[서울] AI 해커톤 (온라인 진행)", benefits="상금 300만원", eligibility="대학생"), taxonomy, now),
        normalize(raw(source_url="https://example.com/2", title="게임 공모전", fee="free"), taxonomy, now),
        normalize(raw(source_url="https://example.com/3", title="데이터 경진대회"), taxonomy, now),
        normalize(raw(source_url="https://example.com/4", title="개발 행사"), taxonomy, now),
    ]

    assert facet_coverage(items) == {"region": 0.25, "mode": 0.25, "fee": 0.25, "audience": 0.25, "prize": 0.25}
    assert facet_coverage([]) is None
