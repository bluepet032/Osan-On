import json
from datetime import datetime
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

import pytest

from pipeline.collectors.gov24 import Gov24Collector
from pipeline.config import SourceConfig, load_taxonomy
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


def test_normalize_maps_category_and_type(monkeypatch):
    pages = {"serviceList": [[service("A1", "경기도 오산시", 서비스분야="임신·출산", 지원유형="현금(감면)")]], "supportConditions": [[]]}
    raw = collector(FakeClient(pages), monkeypatch).collect(NOW)[0]

    item = normalize(raw, load_taxonomy(), NOW)

    assert item.domain == "pregnancy"
    assert item.primary_type == "cash"
    assert item.jurisdiction == "osan"
    assert item.relevance.decision == "publish"
    assert 60 <= len(item.summary) <= 180
