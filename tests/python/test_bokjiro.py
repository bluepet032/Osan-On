from datetime import datetime
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

import pytest

from pipeline.collectors.bokjiro import BokjiroCollector, conditions_of
from pipeline.config import SourceConfig
from pipeline.dedupe import deduplicate
from pipeline.http import FetchError, Response
from pipeline.models import RawOpportunity
from pipeline.normalize import normalize


NOW = datetime(2026, 10, 16, 9, tzinfo=ZoneInfo("Asia/Seoul"))


def list_row(service_id: str, ctpv: str = "경기도", sgg: str | None = "오산시", **fields) -> str:
    values = {
        "servId": service_id, "servNm": f"혜택 {service_id}", "servDgst": "생활 안정을 돕습니다", "ctpvNm": ctpv,
        "bizChrDeptNm": "경기도 오산시 복지교육국 희망복지과", "aplyMtdNm": "방문, 인터넷", "srvPvsnNm": "현금지급",
        "intrsThemaNmArray": "서민금융, 임신·출산", "trgterIndvdlNmArray": "장애인",
        "servDtlLink": f"https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId={service_id}&amp;wlfareInfoReldBztpCd=02",
        **fields,
    }
    if sgg:
        values["sggNm"] = sgg
    return "<servList>" + "".join(f"<{key}>{value}</{key}>" for key, value in values.items() if value is not None) + "</servList>"


def detail(service_id: str, end: str = "99991231") -> str:
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><wantedDtl><resultCode>0</resultCode><resultMessage>SUCCESS</resultMessage>
<servId>{service_id}</servId><enfcBgngYmd>20260101</enfcBgngYmd><enfcEndYmd>{end}</enfcEndYmd>
<sprtTrgtCn>오산시에 주민등록을 둔 장애인</sprtTrgtCn><slctCritCn>소득 무관</slctCritCn><alwServCn>월 5만원</alwServCn><aplyMtdCn></aplyMtdCn>
<inqplCtadrList><wlfareInfoReldCn>031-8036-7407</wlfareInfoReldCn><wlfareInfoReldNm>오산시청 희망복지과</wlfareInfoReldNm></inqplCtadrList></wantedDtl>"""


class FakeClient:
    def __init__(self, rows: list[str], per_page: int = 500, fail_detail: bool = False, ends: dict[str, str] | None = None):
        self.rows, self.per_page, self.fail_detail, self.ends = rows, per_page, fail_detail, ends or {}
        self.requests: list[str] = []

    def get(self, url, headers=None):
        self.requests.append(url)
        query = parse_qs(urlsplit(url).query)
        if url.split("?")[0].endswith("LcgvWelfaredetailed"):
            if self.fail_detail:
                raise FetchError(f"timeout {url}")
            service_id = query["servId"][0]
            return Response(url, 200, detail(service_id, self.ends.get(service_id, "99991231")), "text/xml")
        page = int(query["pageNo"][0])
        chunk = self.rows[(page - 1) * self.per_page: page * self.per_page]
        body = f"<wantedList><totalCount>{len(self.rows)}</totalCount><pageNo>{page}</pageNo><resultCode>0</resultCode>{''.join(chunk)}</wantedList>"
        return Response(url, 200, body, "text/xml")


def collector(client: FakeClient, monkeypatch, key: str | None = "SECRET") -> BokjiroCollector:
    if key is None:
        monkeypatch.delenv("GOV24_API_KEY", raising=False)
    else:
        monkeypatch.setenv("GOV24_API_KEY", key)
    config = SourceConfig(
        id="bokjiro", name="복지로", kind="government", priority=90, schedule="slow", mode="api",
        list_url="https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LcgvWelfarelist", homepage="https://www.bokjiro.go.kr/",
    )
    gathered = BokjiroCollector(config, client)
    gathered.PER_PAGE = client.per_page
    return gathered


def test_keeps_osan_and_gyeonggi_level_services_with_details(monkeypatch):
    rows = [list_row("O1"), list_row("G1", sgg=None), list_row("X1", sgg="성남시"), list_row("X2", ctpv="서울특별시", sgg=None)]
    client = FakeClient(rows, per_page=2)

    items = {item.source_post_id: item for item in collector(client, monkeypatch).collect(NOW, limit=100)}

    assert {key: item.jurisdiction for key, item in items.items()} == {"O1": "osan", "G1": "gyeonggi"}
    osan = items["O1"]
    assert osan.title == "혜택 O1"
    assert osan.organizer == "경기도 오산시 복지교육국 희망복지과"
    assert osan.eligibility == "오산시에 주민등록을 둔 장애인\n소득 무관"
    assert osan.benefits == "월 5만원"
    assert osan.location == "방문, 인터넷 · 오산시청 희망복지과 031-8036-7407"
    assert osan.source_url.startswith("https://www.bokjiro.go.kr/") and "&amp;" not in osan.source_url
    assert osan.apply_methods == ["online", "visit"]
    assert osan.date_kind == "ongoing"
    assert osan.conditions == {"codes": ["JA0328"], "age_min": None, "age_max": None}
    # Only the two kept services need a detail call.
    assert sum("LcgvWelfaredetailed" in url for url in client.requests) == 2


@pytest.mark.parametrize(("department", "title", "expected"), [
    ("경기도 복지국 노인복지과", "노인 월동난방비 지원", "gyeonggi"),
    # Real 2026-10-17 rows without sggNm that belong to another city.
    ("경기도 구리시 보건소 건강증진과", "난임부부 시술비 지원(경기형) 사업", None),
    ("경기도 수원시 시민복지국 돌봄정책과", "수원형 통합돌봄 수원새빛돌봄(누구나) 사업", None),
    ("경기도 복지국 노인복지과", "안성시 무연고 사망자 관리(장제인건비)", None),
    ("경기도 파주시 복지정책국 노인장애인과", "(파주시)무연고 사망자 장례비 지원", None),
    ("경기도 여성가족국 여성정책과", "일본군'위안부' 피해자 생활안정지원", "gyeonggi"),
])
def test_city_services_without_sgg_are_not_province_benefits(department, title, expected):
    from pipeline.collectors.bokjiro import place_of
    assert place_of({"ctpvNm": "경기도", "bizChrDeptNm": department, "servNm": title}) == expected


def test_a_dated_enforcement_period_becomes_the_deadline(monkeypatch):
    client = FakeClient([list_row("O1")], ends={"O1": "20261231"})

    [item] = collector(client, monkeypatch).collect(NOW)

    assert (item.recruit_start, item.recruit_end, item.date_kind) == ("2026-01-01", "2026-12-31", "exact")


@pytest.mark.parametrize(("targets", "expected"), [
    ("장애인, 보훈대상자", ["JA0328", "JA0329"]),
    ("다문화·탈북민, 다자녀", ["JA0401", "JA0402", "JA0411"]),
    ("저소득", ["JA0201", "JA0202", "JA0203"]),
    # Groups whose combination the source does not explain, missing or unknown targets: no judgement.
    ("한부모·조손, 저소득", None),
    ("", None),
    ("장애인, 노숙인", None),
])
def test_targets_become_conditions_only_within_one_group(targets, expected):
    result = conditions_of(targets)
    assert (result and result["codes"]) == expected


@pytest.mark.parametrize(("stages", "expected"), [
    ("청년", ([], 19, 39)),
    ("노년, 청년, 중장년", ([], 19, None)),
    ("임신 · 출산", (["JA0301", "JA0302", "JA0303"], None, None)),
    # Parents apply for children's services, so a child stage says nothing about the applicant's age.
    ("아동, 청소년", None),
    ("청소년, 청년", None),
    # A gap, pregnancy mixed with ages, or nothing to go on: no judgement.
    ("청년, 노년", None),
    ("임신 · 출산, 청년", None),
    ("", None),
])
def test_life_stages_judge_services_without_targets(stages, expected):
    result = conditions_of("", stages)
    assert (result and (result["codes"], result["age_min"], result["age_max"])) == expected
    assert result is None or result["life"]
    # Listed targets keep deciding on their own.
    assert conditions_of("장애인", stages) == {"codes": ["JA0328"], "age_min": None, "age_max": None}


def test_category_and_support_form_are_mapped(monkeypatch):
    rows = [list_row("O1", intrsThemaNmArray="서민금융, 임신·출산", srvPvsnNm="지역화폐"), list_row("O2", intrsThemaNmArray="서민금융", srvPvsnNm="현물지급")]
    items = {raw.source_post_id: normalize(raw, NOW) for raw in collector(FakeClient(rows), monkeypatch).collect(NOW)}

    assert (items["O1"].domain, items["O1"].primary_type) == ("pregnancy", "voucher")
    assert (items["O2"].domain, items["O2"].primary_type) == ("living", "in_kind")


def test_missing_key_and_failures_do_not_leak_the_key(monkeypatch):
    with pytest.raises(FetchError, match="GOV24_API_KEY"):
        collector(FakeClient([list_row("O1")]), monkeypatch, key=None).collect(NOW)
    with pytest.raises(FetchError) as error:
        collector(FakeClient([list_row("O1")], fail_detail=True), monkeypatch).collect(NOW)
    assert "SECRET" not in str(error.value)


def test_api_error_response_fails_the_source(monkeypatch):
    class Unregistered(FakeClient):
        def get(self, url, headers=None):
            return Response(url, 200, "<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>등록되지 않은 서비스키</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>", "text/xml")

    with pytest.raises(FetchError, match="등록되지 않은 서비스키"):
        collector(Unregistered([]), monkeypatch).collect(NOW)


def benefit(source_id: str, title: str, place: str, priority: int, conditions: dict | None = None):
    return normalize(RawOpportunity(
        source_id=source_id, source_name=source_id, source_url=f"https://example.com/{source_id}/{title}", source_post_id=title,
        title=title, organizer=f"{source_id} 기관", date_kind="ongoing", source_priority=priority, jurisdiction=place, conditions=conditions,
    ), NOW)


def test_the_same_benefit_from_both_portals_is_merged_and_keeps_gov24_conditions():
    gov24 = benefit("gov24", "중증장애인 택시요금 할인 지원", "osan", 100, {"codes": ["JA0328"], "age_min": None, "age_max": None})
    items = deduplicate([
        gov24,
        benefit("bokjiro", "중증장애인 택시요금 할인카드 지원", "osan", 90),
        benefit("bokjiro", "경기도 산후조리비 지원", "gyeonggi", 90),
        benefit("gov24", "경기도산후조리비지원", "gyeonggi", 100),
        # Similar wording but a different program, and the same title in another jurisdiction.
        benefit("bokjiro", "저소득 한부모가정 지원 (연료비)", "osan", 90),
        benefit("gov24", "저소득 한부모가정 지원(안경구입비 지원)", "osan", 100),
        benefit("bokjiro", "장애인 활동지원", "gyeonggi", 90),
        benefit("gov24", "장애인 활동지원", "national", 100),
    ])

    assert len(items) == 6
    taxi = next(item for item in items if "택시" in item.title)
    assert taxi.title == "중증장애인 택시요금 할인 지원" and taxi.conditions == gov24.conditions
    assert {source.source_id for source in taxi.sources} == {"gov24", "bokjiro"}


@pytest.mark.parametrize(("bokjiro_title", "gov24_title", "merged"), [
    # Real pairs from 2026-10-17 that differed only in 지원·사업·등 or a descriptive suffix.
    ("한방난임 지원 사업", "한방난임사업 지원", True),
    ("어린이집 입학준비금 지원", "어린이집 입학준비금(현장학습비 등) 지원", True),
    ("기초생활수급 노인 월동난방비 지원", "노인월동난방비 등 지원", True),
    # Different programs that share most words.
    ("경기청년 매치업 플러스(북부특화형)", "경기청년 일자리 매치업 플러스", False),
    ("한부모가족 아동양육비 지원", "한부모가족 학습재료비 등 지원", False),
    ("청년 지원금", "청년 사업자 지원", False),
])
def test_filler_words_do_not_split_the_same_local_benefit(bokjiro_title, gov24_title, merged):
    items = deduplicate([benefit("gov24", gov24_title, "gyeonggi", 100), benefit("bokjiro", bokjiro_title, "gyeonggi", 90)])
    assert (len(items) == 1) == merged
