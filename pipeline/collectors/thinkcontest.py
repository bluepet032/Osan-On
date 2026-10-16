from __future__ import annotations

import json
from datetime import datetime

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.collectors.html import clean_text, parse_date
from pipeline.dates import months_ago
from pipeline.models import RawOpportunity


class ThinkContestCollector(Collector):
    """Use ThinkContest's public category endpoint for game/software opportunities."""

    ENDPOINT = "https://www.thinkcontest.com/thinkgood/user/contest/subList.do"

    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        results: list[RawOpportunity] = []
        seen: set[str] = set()
        max_pages = max(2, (limit + 9) // 10 + 1)
        for search_status, ended_only in (("Y", False), ("N", True)):
            for page in range(1, max_pages + 1):
                response = self.client.post_json(self.ENDPOINT, {
                    "recordsPerPage": 10, "currentPageNo": page,
                    "contest_field": "CCFD002|CCFD003", "host_organ": "",
                    "enter_qualified": "", "award_size": "", "searchStatus": search_status,
                    "sidx": "", "sord": "",
                })
                try:
                    document = json.loads(response.text)
                except json.JSONDecodeError as error:
                    raise CollectorStructureError("씽굿 공개 분류 API가 JSON을 반환하지 않았습니다") from error
                records = document.get("listJsonData") or []
                if not records:
                    break
                page_items = self._records(records, now, ended_only=ended_only)
                for item in page_items:
                    key = item.source_post_id or item.source_url
                    if key in seen:
                        continue
                    seen.add(key)
                    results.append(item)
                if len(results) >= limit:
                    return results[:limit]
        if not results:
            raise CollectorStructureError("씽굿 게임·소프트웨어 분류에서 진행 중 공모전을 찾지 못했습니다")
        return results[:limit]

    def _records(self, records: list[dict], now: datetime, ended_only: bool = False) -> list[RawOpportunity]:
        results: list[RawOpportunity] = []
        cutoff = months_ago(now, 3)
        for item in records:
            process = str(item.get("process") or "").upper()
            if ended_only != (process == "END"):
                continue
            post_id = str(item.get("contest_pk") or item.get("id") or "")
            title = clean_text(str(item.get("program_nm") or item.get("text") or ""))
            if "//" in title:
                title = title.rsplit("//", 1)[-1].strip()
            if not post_id or not title:
                continue
            category = clean_text(str(item.get("contest_field_nm") or "게임/소프트웨어"))
            start = parse_date(str(item.get("accept_dt") or item.get("receive_period") or ""))
            end = parse_date(str(item.get("finish_dt") or ""))
            if ended_only and (not end or datetime.fromisoformat(end).date() < cutoff):
                continue
            body = clean_text(str(item.get("competition_syllabus") or ""))[:6000]
            results.append(RawOpportunity(
                source_id=self.config.id, source_name=self.config.name,
                source_url=f"https://www.thinkcontest.com/thinkgood/user/contest/view.do?contest_pk={post_id}",
                source_post_id=post_id, title=title,
                organizer=clean_text(str(item.get("host_company") or self.config.name)),
                summary=f"씽굿 공모 분야: {category}" + (f" · 상금 {item['prize_money']}" if item.get("prize_money") else ""),
                body_text=body or category, source_kind=self.config.kind,
                source_priority=self.config.priority, recruit_start=start, recruit_end=end,
                date_kind="exact" if end else "unknown",
                eligibility=clean_text(str(item.get("enter_qualified_nm") or item.get("enter_qualified_limit") or "")),
                # `perks` holds internal codes such as "PERK004"; only the prize money is meaningful.
                benefits=f"상금 {clean_text(str(item['prize_money']))}" if item.get("prize_money") else "",
                original_category=category, collected_at=now.isoformat(timespec="seconds"),
            ))
        return results
