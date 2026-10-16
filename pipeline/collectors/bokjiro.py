from __future__ import annotations

import os
import re
from datetime import datetime
from urllib.parse import unquote
from xml.etree import ElementTree

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.collectors.gov24 import KEY_RE
from pipeline.collectors.html import with_query
from pipeline.http import FetchError
from pipeline.models import RawOpportunity


# 복지로 대상자(trgterIndvdlNmArray) → 정부24 support condition codes, so src/eligibility.ts can judge them.
# 저소득 has no single threshold; 중위소득 100% 이하 errs toward showing the benefit.
TARGET_CODES = {
    "장애인": ["JA0328"], "보훈대상자": ["JA0329"], "한부모·조손": ["JA0403"], "다자녀": ["JA0411"],
    "다문화·탈북민": ["JA0401", "JA0402"], "저소득": ["JA0201", "JA0202", "JA0203"],
}
APPLY_WORDS = (("인터넷", "online"), ("모바일", "online"), ("E-mail", "online"), ("방문", "visit"))


def split_list(value: str | None) -> list[str]:
    return [part.strip() for part in (value or "").split(",") if part.strip()]


def conditions_of(targets: str | None) -> dict | None:
    """Condition codes for the listed targets, or None when they cannot be judged.

    The source lists targets without saying whether, say, 한부모 and 저소득 must both hold,
    so targets spanning several condition groups (income, personal, household) are left
    to the original notice instead of being read too strictly.
    """

    names = split_list(targets)
    if not names or any(name not in TARGET_CODES for name in names):
        return None
    codes = sorted({code for name in names for code in TARGET_CODES[name]})
    if len({code[:4] for code in codes}) > 1:
        return None
    return {"codes": codes, "age_min": None, "age_max": None}


def place_of(row: dict) -> str | None:
    if row.get("ctpvNm") != "경기도":
        return None
    if row.get("sggNm") == "오산시":
        return "osan"
    return None if row.get("sggNm") else "gyeonggi"


def ymd(value: str | None) -> str | None:
    return f"{value[:4]}-{value[4:6]}-{value[6:8]}" if value and re.fullmatch(r"\d{8}", value) else None


class BokjiroCollector(Collector):
    """복지로 지자체복지서비스 API: Osan's and Gyeonggi Province's own welfare services."""

    BASE = "https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations"
    PER_PAGE = 500

    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        # Same 공공데이터포털 account key as 정부24; each API only needs its own 활용신청.
        key = unquote(os.environ.get("GOV24_API_KEY", "").strip())
        if not key:
            raise FetchError("GOV24_API_KEY가 없습니다. 공공데이터포털 인증키를 .env 또는 GitHub Secret에 넣으세요")
        try:
            rows = [row for row in self._list(key) if place_of(row)][:limit]
            details = {row["servId"]: self._detail(key, row["servId"]) for row in rows}
        except FetchError as error:
            # Partial data would make benefits disappear, so the whole source fails and keeps old data.
            raise FetchError(KEY_RE.sub("serviceKey=***", str(error))) from None
        if not rows:
            raise CollectorStructureError("복지로 목록에서 오산시·경기도 서비스를 찾지 못했습니다")
        return [self._raw(row, details[row["servId"]], now) for row in rows]

    def _get(self, operation: str, key: str, **params: str | int) -> ElementTree.Element:
        response = self.client.get(with_query(f"{self.BASE}/{operation}", serviceKey=key, **params))
        try:
            root = ElementTree.fromstring(response.text)
        except ElementTree.ParseError as error:
            raise CollectorStructureError(f"복지로 {operation} 응답이 XML이 아닙니다") from error
        # Gateway errors (unregistered key, quota) come as OpenAPI_ServiceResponse instead of data.
        if root.tag == "OpenAPI_ServiceResponse" or (root.findtext("resultCode") or "0") != "0":
            reason = root.findtext(".//returnAuthMsg") or root.findtext("resultMessage") or "알 수 없는 오류"
            raise FetchError(f"복지로 {operation} 오류: {reason}")
        return root

    def _list(self, key: str) -> list[dict]:
        rows: list[dict] = []
        page = 1
        while True:
            root = self._get("LcgvWelfarelist", key, pageNo=page, numOfRows=self.PER_PAGE)
            items = [{child.tag: (child.text or "").strip() for child in entry} for entry in root.findall("servList")]
            rows.extend(items)
            if not items or len(rows) >= int(root.findtext("totalCount") or 0):
                return rows
            page += 1

    def _detail(self, key: str, service_id: str) -> ElementTree.Element:
        return self._get("LcgvWelfaredetailed", key, servId=service_id)

    def _raw(self, row: dict, detail: ElementTree.Element, now: datetime) -> RawOpportunity:
        text = lambda value: re.sub(r"[ \t]+", " ", value or "").strip()
        target, criteria = text(detail.findtext("sprtTrgtCn")), text(detail.findtext("slctCritCn"))
        contacts = [
            " ".join(part for part in (text(entry.findtext("wlfareInfoReldNm")), text(entry.findtext("wlfareInfoReldCn"))) if part)
            for entry in detail.findall("inqplCtadrList")
        ]
        how = text(detail.findtext("aplyMtdCn")) or row.get("aplyMtdNm", "")
        start, end = ymd(detail.findtext("enfcBgngYmd")), ymd(detail.findtext("enfcEndYmd"))
        # 9999-12-31 is the source's "no end"; only a real end date is a deadline.
        dated = end is not None and not end.startswith("9999")
        methods = row.get("aplyMtdNm", "")
        url = row.get("servDtlLink") or f"https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId={row['servId']}"
        return RawOpportunity(
            source_id=self.config.id,
            source_name=self.config.name,
            source_url=url,
            source_post_id=row["servId"],
            title=text(row.get("servNm")),
            organizer=text(row.get("bizChrDeptNm")),
            summary=text(row.get("servDgst")).replace("\n", " "),
            source_kind=self.config.kind,
            source_priority=self.config.priority,
            application_url=url,
            recruit_start=start if dated else None,
            recruit_end=end if dated else None,
            date_kind="exact" if dated else "ongoing",
            eligibility="\n".join(part for part in dict.fromkeys((target, criteria)) if part),
            benefits=text(detail.findtext("alwServCn")),
            location=" · ".join(part for part in (how, *contacts) if part),
            original_category=row.get("intrsThemaNmArray", ""),
            collected_at=now.isoformat(timespec="seconds"),
            jurisdiction=place_of(row),  # type: ignore[arg-type]
            conditions=conditions_of(row.get("trgterIndvdlNmArray")),
            # 서민금융 is attached to most services and says nothing about the field.
            category=", ".join(theme for theme in split_list(row.get("intrsThemaNmArray")) if theme != "서민금융"),
            support_type=row.get("srvPvsnNm", ""),
            apply_methods=list(dict.fromkeys(method for word, method in APPLY_WORDS if word in methods)),
        )
