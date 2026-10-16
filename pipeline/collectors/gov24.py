from __future__ import annotations

import json
import os
import re
from datetime import datetime
from urllib.parse import unquote

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.collectors.html import dates_from_text, with_query
from pipeline.http import FetchError
from pipeline.models import RawOpportunity


KEY_RE = re.compile(r"serviceKey=[^&\s'\"]+")


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
    if "오산시" in agency:
        return "osan"
    if agency == "경기도":
        return "gyeonggi"
    if (row.get("소관기관유형") or "").strip() == "중앙행정기관":
        return "national"
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
            if not data or len(rows) >= int(payload.get("totalCount") or 0):
                return rows
            page += 1

    def _raw(self, row: dict, place: str, conditions: dict | None, now: datetime) -> RawOpportunity:
        period = row.get("신청기한") or ""
        start, end = dates_from_text(period)
        if "상시" in period:
            date_kind = "ongoing"
        elif end:
            date_kind = "exact"
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
        )
