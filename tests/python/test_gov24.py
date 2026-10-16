import json
from datetime import datetime
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

import pytest

from pipeline.collectors.gov24 import Gov24Collector
from pipeline.config import SourceConfig
from pipeline.http import FetchError, Response
from pipeline.normalize import normalize


NOW = datetime(2026, 10, 16, 9, tzinfo=ZoneInfo("Asia/Seoul"))


def service(service_id: str, agency: str, agency_type: str = "지방자치단체", user: str = "개인", **extra) -> dict:
    return {
        "서비스ID": service_id, "서비스명": f"{agency} 혜택 {service_id}", "서비스목적요약": "생활 안정을 돕습니다",
        "지원유형": "현금", "지원대상": "만 19~34세 여성", "선정기준": "소득 무관", "지원내용": "월 10만원",
        "신청방법": "방문", "신청기한": "상시신청", "상세조회URL": f"https://www.gov.kr/portal/rcvfvrSvc/dtlEx/{service_id}",
        "소관기관명": agency, "부서명": "복지과", "소관기관유형": agency_type, "사용자구분": user,
        "서비스분야": "생활안정", "접수기관": "주민센터", "전화문의": "031-000-0000", **extra,
    }


class FakeClient:
    def __init__(self, pages: dict[str, list[list[dict]]], fail_on: tuple[str, int] | None = None):
        self.pages = pages
        self.fail_on = fail_on
        self.requests: list[str] = []

    def get(self, url, headers=None):
        self.requests.append(url)
        endpoint = urlsplit(url).path.rsplit("/", 1)[-1]
        page = int(parse_qs(urlsplit(url).query)["page"][0])
        if self.fail_on == (endpoint, page):
            raise FetchError(f"timeout {url}")
        chunks = self.pages[endpoint]
        total = sum(len(chunk) for chunk in chunks)
        data = chunks[page - 1] if page <= len(chunks) else []
        return Response(url, 200, json.dumps({"page": page, "totalCount": total, "currentCount": len(data), "data": data}), "application/json")


def collector(client: FakeClient, monkeypatch, key: str | None = "SECRET") -> Gov24Collector:
    if key is None:
        monkeypatch.delenv("GOV24_API_KEY", raising=False)
    else:
        monkeypatch.setenv("GOV24_API_KEY", key)
    config = SourceConfig(
        id="gov24", name="정부24", kind="government", priority=100, schedule="slow", mode="api",
        list_url="https://api.odcloud.kr/api/gov24/v3", homepage="https://www.gov.kr/",
    )
    return Gov24Collector(config, client)


def three_services() -> dict:
    return {
        "serviceList": [[
            service("A1", "경기도 오산시"),
            service("B1", "경기도"),
            service("C1", "보건복지부", agency_type="중앙행정기관"),
        ]],
        "supportConditions": [[
            {"서비스ID": "A1", "JA0102": "Y", "JA0101": None, "JA0404": "Y", "JA0110": 19, "JA0111": 34},
            {"서비스ID": "B1", "JA0110": 0, "JA0111": 0},
        ]],
    }


def test_collects_and_joins_conditions_by_service_id(monkeypatch):
    items = {item.source_post_id: item for item in collector(FakeClient(three_services()), monkeypatch).collect(NOW)}

    assert set(items) == {"A1", "B1", "C1"}
    assert items["A1"].conditions == {"codes": ["JA0102", "JA0404"], "age_min": 19, "age_max": 34}
    assert items["B1"].conditions == {"codes": [], "age_min": None, "age_max": None}
    assert items["C1"].conditions is None


def test_filters_jurisdiction_and_user_type(monkeypatch):
    pages = three_services()
    pages["serviceList"][0] += [
        service("D1", "서울특별시 강남구"),
        service("E1", "경기도 오산시", user="법인"),
        service("F1", "경기도 오산시", user="개인||가구"),
    ]

    items = {item.source_post_id: item for item in collector(FakeClient(pages), monkeypatch).collect(NOW)}

    assert set(items) == {"A1", "B1", "C1", "F1"}
    assert {key: items[key].jurisdiction for key in ("A1", "B1", "C1")} == {"A1": "osan", "B1": "gyeonggi", "C1": "national"}


def test_reads_every_page(monkeypatch):
    pages = {
        "serviceList": [[service("A1", "경기도 오산시"), service("A2", "경기도 오산시")], [service("A3", "경기도 오산시")]],
        "supportConditions": [[]],
    }
    gov24 = collector(FakeClient(pages), monkeypatch)
    gov24.PER_PAGE = 2

    assert len(gov24.collect(NOW)) == 3


def test_application_period(monkeypatch):
    pages = {"serviceList": [[
        service("A1", "경기도 오산시", 신청기한="상시신청"),
        service("A2", "경기도 오산시", 신청기한="2026.03.02 ~ 2026.12.31"),
        service("A3", "경기도 오산시", 신청기한="예산 소진 시까지"),
    ]], "supportConditions": [[]]}

    items = {item.source_post_id: item for item in collector(FakeClient(pages), monkeypatch).collect(NOW)}

    assert items["A1"].date_kind == "ongoing"
    assert (items["A2"].recruit_end, items["A2"].date_kind) == ("2026-12-31", "exact")
    assert items["A3"].date_kind == "inquiry"


def test_application_methods_are_read_from_the_joined_list(monkeypatch):
    methods = {"A1": "기타 온라인신청||방문신청", "A2": "정부24온라인신청", "A3": "신청불필요", "A4": "직접입력", "A5": "방문신청||직접입력"}
    pages = {"serviceList": [[service(key, "경기도 오산시", 신청방법=text) for key, text in methods.items()]], "supportConditions": [[]]}

    items = {item.source_post_id: item.apply_methods for item in collector(FakeClient(pages), monkeypatch).collect(NOW)}

    assert items == {"A1": ["online", "visit"], "A2": ["online"], "A3": ["none"], "A4": [], "A5": ["visit"]}


def test_missing_key_raises(monkeypatch):
    with pytest.raises(FetchError, match="GOV24_API_KEY"):
        collector(FakeClient(three_services()), monkeypatch, key=None).collect(NOW)


def test_page_failure_fails_whole_source_without_leaking_key(monkeypatch):
    pages = {"serviceList": [[service("A1", "경기도 오산시")], [service("A2", "경기도 오산시")]], "supportConditions": [[]]}
    gov24 = collector(FakeClient(pages, fail_on=("serviceList", 2)), monkeypatch)
    gov24.PER_PAGE = 1

    with pytest.raises(FetchError) as error:
        gov24.collect(NOW)
    assert "SECRET" not in str(error.value)


def test_support_type_prefers_the_detail_in_brackets(monkeypatch):
    kinds = {"A1": "현금", "A2": "현금(융자)", "A3": "현금(감면)", "A4": "서비스(의료)", "A5": "기타(상담)"}
    pages = {"serviceList": [[service(key, "경기도 오산시", 지원유형=kind) for key, kind in kinds.items()]], "supportConditions": [[]]}

    items = {raw.source_post_id: normalize(raw, NOW).primary_type for raw in collector(FakeClient(pages), monkeypatch).collect(NOW)}

    assert items == {"A1": "cash", "A2": "loan", "A3": "reduction", "A4": "service", "A5": "other"}


def test_normalize_maps_category_and_type(monkeypatch):
    pages = {"serviceList": [[service("A1", "경기도 오산시", 서비스분야="임신·출산", 지원유형="현금(감면)")]], "supportConditions": [[]]}
    raw = collector(FakeClient(pages), monkeypatch).collect(NOW)[0]

    item = normalize(raw, NOW)

    assert item.domain == "pregnancy"
    assert item.primary_type == "reduction"
    assert item.jurisdiction == "osan"
    assert item.relevance.decision == "publish"
    assert 60 <= len(item.summary) <= 180


def test_jurisdiction_covers_affiliated_agencies_but_not_other_cities(monkeypatch):
    names = {
        "O1": ("(재)오산문화재단", "지방출자_출연기관"), "O2": ("재단법인오산교육재단", "지방출자_출연기관"),
        "O3": ("오산시시설관리공단", "지방공기업"), "X1": ("(재)전남바이오산업진흥원", "지방출자_출연기관"),
        "G1": ("경기도교육청", "교육청"), "G2": ("경기복지재단", "지방출자_출연기관"),
        "X2": ("경기도 고양시 상하수도사업소", "지방공기업"), "X3": ("경기도 안양시", "시군구"),
        "N1": ("한국장학재단", "공공기관"), "X4": ("서울특별시교육청", "교육청"),
    }
    pages = {"serviceList": [[service(key, name, agency_type=kind) for key, (name, kind) in names.items()]], "supportConditions": [[]]}

    items = {item.source_post_id: item.jurisdiction for item in collector(FakeClient(pages), monkeypatch).collect(NOW)}

    assert items == {"O1": "osan", "O2": "osan", "O3": "osan", "G1": "gyeonggi", "G2": "gyeonggi", "N1": "national"}


def test_only_a_leading_dated_range_is_trusted(monkeypatch):
    periods = {
        "A1": "2026.1.1.~2026.12.10.", "A2": "2025. 4. 1. ~ 2026. 3. 31.", "A3": "수시", "A4": "연중",
        "A5": "급여의 사유가 발생한 날로부터 5년 이내(2012. 7. 1. 이후 ...)", "A6": "2026. 2. 2.~11. 30.(예산 소진 시 마감)",
    }
    pages = {"serviceList": [[service(key, "경기도 오산시", 신청기한=text) for key, text in periods.items()]], "supportConditions": [[]]}

    items = {item.source_post_id: item for item in collector(FakeClient(pages), monkeypatch).collect(NOW)}

    assert (items["A1"].recruit_start, items["A1"].recruit_end, items["A1"].date_kind) == ("2026-01-01", "2026-12-10", "exact")
    assert items["A2"].recruit_end == "2026-03-31"
    assert items["A3"].date_kind == items["A4"].date_kind == "ongoing"
    assert (items["A5"].recruit_end, items["A5"].date_kind) == (None, "inquiry")
    assert (items["A6"].recruit_end, items["A6"].date_kind) == (None, "inquiry")
