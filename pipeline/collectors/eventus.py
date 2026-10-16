from __future__ import annotations

import json
from datetime import datetime

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.collectors.html import clean_text, parse_date
from pipeline.models import RawOpportunity


def raw_value(item: dict, key: str, default=None):
    value = item.get(key, default)
    if isinstance(value, dict) and "raw" in value:
        return value["raw"]
    return value


def embedded_search_data(markup: str) -> dict:
    marker = "searchDataRaw:"
    start = markup.find(marker)
    if start < 0:
        raise CollectorStructureError("이벤터스 페이지에서 공개 검색 데이터를 찾지 못했습니다")
    fragment = markup[start + len(marker):].lstrip()
    try:
        document, _ = json.JSONDecoder().raw_decode(fragment)
    except json.JSONDecodeError as error:
        raise CollectorStructureError("이벤터스 공개 검색 데이터가 올바른 JSON이 아닙니다") from error
    if not isinstance(document, dict):
        raise CollectorStructureError("이벤터스 공개 검색 데이터 형식이 올바르지 않습니다")
    return document


class EventusCollector(Collector):
    """Read the public search payload embedded in the Event-us result page."""

    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        response = self.client.get(self.config.list_url)
        records = embedded_search_data(response.text).get("results", [])
        results: list[RawOpportunity] = []
        for record in records:
            if not isinstance(record, dict):
                continue
            post_id = str(raw_value(record, "id", "")).strip()
            subdomain = str(raw_value(record, "subdomain", "")).strip()
            title = clean_text(str(raw_value(record, "title", "")))
            if not post_id or not subdomain or not title:
                continue
            source_url = f"https://event-us.kr/{subdomain}/event/{post_id}"
            description = clean_text(str(raw_value(record, "description", "")))
            category = clean_text(" ".join(str(raw_value(record, key, "")) for key in ("category", "category2", "event_type")))
            tags = raw_value(record, "tags", [])
            tag_text = " ".join(str(value) for value in tags) if isinstance(tags, list) else str(tags or "")
            mode = str(raw_value(record, "event_system_type", "")).lower()
            if mode not in {"online", "offline", "hybrid"}:
                mode = ""
            paid = str(raw_value(record, "payway", "false")).lower() == "true"
            results.append(RawOpportunity(
                source_id=self.config.id,
                source_name=self.config.name,
                source_url=source_url,
                source_post_id=post_id,
                title=title,
                organizer=clean_text(str(raw_value(record, "app_title", ""))) or self.config.name,
                summary=description[:180] or "상세 정보는 원문 확인 필요",
                body_text=f"{title} {description} {category} {tag_text}",
                source_kind=self.config.kind,
                source_priority=self.config.priority,
                application_url=source_url,
                recruit_start=parse_date(str(raw_value(record, "register_start_date", ""))),
                recruit_end=parse_date(str(raw_value(record, "register_due_date", ""))),
                event_start=parse_date(str(raw_value(record, "start_date", ""))),
                event_end=parse_date(str(raw_value(record, "close_date", ""))),
                date_kind="exact" if raw_value(record, "register_due_date") else "unknown",
                location=clean_text(str(raw_value(record, "area_detail", "") or raw_value(record, "full_address", "") or "")),
                mode=mode,
                fee="paid" if paid else "free",
                original_category=category,
                collected_at=now.isoformat(timespec="seconds"),
            ))
            if len(results) >= limit:
                break
        if not results:
            raise CollectorStructureError("이벤터스 공개 검색 데이터에서 행사 항목을 찾지 못했습니다")
        return results
