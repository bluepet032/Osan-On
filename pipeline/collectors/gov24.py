from __future__ import annotations

import json
import os
import re
from datetime import datetime
from urllib.parse import unquote

from pipeline.collectors.base import Collector, CollectorStructureError, dates_from_text, with_query
from pipeline.http import FetchError
from pipeline.models import RawOpportunity


KEY_RE = re.compile(r"serviceKey=[^&\s'\"]+")
# "경기도 오산시", "(재)오산문화재단", "재단법인오산교육재단", but not "전남바이오산업진흥원".
OSAN_RE = re.compile(r"(?:^|[^가-힣]|재단법인)오산")
# Agencies of another Gyeonggi city, e.g. "경기도 고양시 상하수도사업소".
OTHER_CITY_RE = re.compile(r"경기도\s+\S+[시군]")
NATIONAL_TYPES = {"중앙행정기관", "공공기관"}
ONGOING_RE = re.compile(r"상시|수시|연중")
# 신청방법 is a "||"-joined list such as "기타 온라인신청||방문신청"; "직접입력" (free text) says nothing.
APPLY_WORDS = (("온라인", "online"), ("방문", "visit"), ("신청불필요", "none"))


def apply_methods(text: str) -> list[str]:
    compact = re.sub(r"\s+", "", text)
    return [method for word, method in APPLY_WORDS if word in compact]


# Only a leading "YYYY.M.D ~ YYYY.M.D" range is trusted: free text such as "5년 이내(2012.7.1. 이후…)"
# or "2026.2.2.~11.30." would otherwise misdate a live benefit as closed.
RANGE_RE = re.compile(
    r"^\s*20\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*[.일]?\s*(?:\([^)]*\)\s*)?"
    r"[~∼〜\-–]\s*20\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}"
)


def condition_record(row: dict) -> dict:
    def age(key: str) -> int | None:
        try:
            return int(row.get(key) or 0) or None
        except (TypeError, ValueError):
            return None

    codes = sorted(key for key, value in row.items() if key.startswith("JA") and value == "Y")
    return {"codes": codes, "age_min": age("JA0110"), "age_max": age("JA0111")}


def jurisdiction_of(row: dict) -> str | None:
    agency = (row.get("소관기관명") or "").strip()
    kind = (row.get("소관기관유형") or "").strip()
    if OSAN_RE.search(agency):
        return "osan"
    if kind in NATIONAL_TYPES:
        return "national"
    if "경기" in agency and kind != "시군구" and not OTHER_CITY_RE.search(agency):
        return "gyeonggi"
    return None


class Gov24Collector(Collector):
    """정부24 공공서비스(혜택) API: services for Osan, Gyeonggi and central ministries, with eligibility codes."""

    BASE = "https://api.odcloud.kr/api/gov24/v3"
    PER_PAGE = 1000

    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        # The portal issues an URL-encoded and a decoded key; unquote accepts either.
        key = unquote(os.environ.get("GOV24_API_KEY", "").strip())
        if not key:
            raise FetchError("GOV24_API_KEY가 없습니다. 공공데이터포털에서 발급받아 .env 또는 GitHub Secret에 넣으세요")
        try:
            services = self._rows("serviceList", key)
            conditions = {row.get("서비스ID"): condition_record(row) for row in self._rows("supportConditions", key)}
        except FetchError as error:
            # A partial list would make benefits disappear, so the whole source fails and keeps old data.
            raise FetchError(KEY_RE.sub("serviceKey=***", str(error))) from None
        if not services:
            raise CollectorStructureError("정부24 serviceList가 비어 있습니다")
        results = []
        for row in services:
            place = jurisdiction_of(row)
            users = row.get("사용자구분") or ""
            if not place or ("개인" not in users and "가구" not in users):
                continue
            results.append(self._raw(row, place, conditions.get(row.get("서비스ID")), now))
        return results[:limit]

    def _rows(self, endpoint: str, key: str) -> list[dict]:
        rows: list[dict] = []
        page = 1
        while True:
            url = with_query(f"{self.BASE}/{endpoint}", page=page, perPage=self.PER_PAGE, serviceKey=key)
            try:
                payload = json.loads(self.client.get(url).text)
            except ValueError as error:
                raise CollectorStructureError(f"정부24 {endpoint} 응답이 JSON이 아닙니다") from error
            data = payload.get("data") or []
            rows.extend(data)
            total = int(payload.get("totalCount") or 0)
            if len(rows) >= total:
                return rows
            if not data:
                # An empty page before the end is a hiccup, not the end: a partial list would hide benefits.
                raise CollectorStructureError(f"정부24 {endpoint} 목록이 {total}건 중 {len(rows)}건에서 끊겼습니다")
            page += 1

    def _raw(self, row: dict, place: str, conditions: dict | None, now: datetime) -> RawOpportunity:
        period = row.get("신청기한") or ""
        dated = RANGE_RE.match(period)
        start, end = dates_from_text(dated.group(0)) if dated else (None, None)
        if dated and end:
            date_kind = "exact"
        elif ONGOING_RE.search(period):
            date_kind = "ongoing"
        else:
            date_kind = "inquiry"
        text = lambda key: re.sub(r"\s+", " ", row.get(key) or "").strip()
        url = text("상세조회URL") or f"https://www.gov.kr/portal/rcvfvrSvc/dtlEx/{row.get('서비스ID')}"
        return RawOpportunity(
            source_id=self.config.id,
            source_name=self.config.name,
            source_url=url,
            source_post_id=row.get("서비스ID"),
            title=text("서비스명"),
            organizer=" ".join(part for part in (text("소관기관명"), text("부서명")) if part),
            summary=text("서비스목적요약"),
            source_kind=self.config.kind,
            source_priority=self.config.priority,
            application_url=url,
            recruit_start=start if date_kind == "exact" else None,
            recruit_end=end if date_kind == "exact" else None,
            date_kind=date_kind,  # type: ignore[arg-type]
            eligibility="\n".join(part for part in (text("지원대상"), text("선정기준")) if part),
            benefits=text("지원내용"),
            location=" · ".join(part for part in (text("신청방법"), text("접수기관"), text("전화문의")) if part),
            original_category=text("서비스분야"),
            collected_at=now.isoformat(timespec="seconds"),
            jurisdiction=place,  # type: ignore[arg-type]
            conditions=conditions,
            category=text("서비스분야"),
            support_type=text("지원유형"),
            apply_methods=apply_methods(row.get("신청방법") or ""),
        )
