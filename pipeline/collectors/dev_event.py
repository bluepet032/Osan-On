from __future__ import annotations

import re
from datetime import date, datetime
from urllib.parse import urljoin

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.collectors.html import clean_text
from pipeline.models import RawOpportunity


LINK_RE = re.compile(r"^\s*[-*]\s*\[([^]]+)]\(([^)]+)\)")
META_RE = re.compile(r"^\s*[-*]\s*(분류|주최|접수|일시)\s*[:：]\s*(.+)")
INLINE_META_RE = re.compile(
    r"(?:^(?:[-*]\s+)?|\s+[-*]\s+)(분류|주최|접수|일시)\s*[:：]\s*(.*?)"
    r"(?=\s+[-*]\s+(?:분류|주최|접수|일시)\s*[:：]|$)"
)
INLINE_ITEM_RE = re.compile(
    r"-\s*__?\[([^]]+)]\((https?://[^)]+)\)__?\s*(.*?)"
    r"(?=\s+-\s+__?\[|\s+##\s+`|\n##\s+|\n-{3,}|\Z)",
    re.DOTALL,
)
DATE_RE = re.compile(
    r"(?<!\d)(?:(\d{4}|\d{2})[.\-/년\s]+)?(\d{1,2})[.\-/월\s]+(\d{1,2})(?:일)?(?!\d)"
)


def dates_from_text(value: str, year: int) -> tuple[str | None, str | None]:
    dates: list[date] = []
    for match in list(DATE_RE.finditer(value))[:2]:
        explicit_year, month, day = match.groups()
        if explicit_year:
            year = int(explicit_year)
            if year < 100:
                year += 2000
        elif dates and int(month) < dates[-1].month:
            year += 1
        try:
            parsed = date(year, int(month), int(day))
        except ValueError:
            return None, None
        if dates and parsed < dates[-1]:
            return None, None
        dates.append(parsed)
    if not dates:
        return None, None
    if len(dates) == 1:
        return None, dates[0].isoformat()
    return dates[0].isoformat(), dates[1].isoformat()


class DevEventCollector(Collector):
    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        response = self.client.get(self.config.list_url)
        inline = self._inline_items(response.text, now, limit)
        if inline:
            return inline
        lines = response.text.splitlines()
        results: list[RawOpportunity] = []
        index = 0
        while index < len(lines) and len(results) < limit:
            match = LINK_RE.match(lines[index])
            if not match:
                index += 1
                continue
            title, url = clean_text(match.group(1)), match.group(2).strip()
            metadata: list[str] = []
            date_text = {"접수": "", "일시": ""}
            heading = "\n".join(lines[:index]).rsplit("##", 1)[-1]
            year_match = re.search(r"(\d{2,4})년", heading)
            year = now.year
            if year_match:
                year = int(year_match.group(1))
                if year < 100:
                    year += 2000
            cursor = index + 1
            while cursor < len(lines) and cursor <= index + 5:
                if LINK_RE.match(lines[cursor]) or lines[cursor].startswith("## "):
                    break
                meta = META_RE.match(lines[cursor])
                if meta:
                    label, value = meta.groups()
                    value = clean_text(value).replace("`", "")
                    metadata.append(value)
                    if label in date_text:
                        date_text[label] = value
                cursor += 1
            combined = " · ".join(metadata)
            start, end = dates_from_text(date_text["접수"], year)
            event_start, event_end = dates_from_text(date_text["일시"], year)
            if event_end and not event_start:
                event_start = event_end
            organizer = self.config.name
            for line in lines[index + 1:cursor]:
                if "주최" in line:
                    organizer = clean_text(line.split(":", 1)[-1]).replace("`", "")
            results.append(RawOpportunity(
                source_id=self.config.id,
                source_name=self.config.name,
                source_url=urljoin(self.config.homepage, url),
                title=title,
                organizer=organizer,
                summary=combined[:180] or "개발자 행사 정보. 상세 내용은 원문 확인 필요",
                body_text=f"{title} {combined}",
                source_kind=self.config.kind,
                source_priority=self.config.priority,
                recruit_start=start,
                recruit_end=end,
                event_start=event_start,
                event_end=event_end,
                date_kind="exact" if end else "unknown",
                original_category=combined,
                collected_at=now.isoformat(timespec="seconds"),
            ))
            index = max(cursor, index + 1)
        if not results:
            raise CollectorStructureError("Dev-Event README에서 현재 행사 항목을 찾지 못했습니다")
        return results

    def _inline_items(self, markdown: str, now: datetime, limit: int) -> list[RawOpportunity]:
        results: list[RawOpportunity] = []
        for match in INLINE_ITEM_RE.finditer(markdown):
            title, url, segment = clean_text(match.group(1)), match.group(2), clean_text(match.group(3)).replace("`", "")
            heading = markdown[:match.start()].rsplit("##", 1)[-1]
            year_match = re.search(r"(\d{2,4})년", heading)
            year = now.year
            if year_match:
                year = int(year_match.group(1))
                if year < 100:
                    year += 2000
            date_text = {"접수": "", "일시": ""}
            for metadata in INLINE_META_RE.finditer(segment):
                label, value = metadata.groups()
                if label in date_text:
                    date_text[label] = value
            start, end = dates_from_text(date_text["접수"], year)
            event_start, event_end = dates_from_text(date_text["일시"], year)
            if event_end and not event_start:
                event_start = event_end
            organizer_match = re.search(r"주최\s*[:：]\s*(.*?)(?=\s+-\s+(?:접수|일시|분류)\s*[:：]|$)", segment)
            organizer = clean_text(organizer_match.group(1)) if organizer_match else self.config.name
            results.append(RawOpportunity(
                source_id=self.config.id,
                source_name=self.config.name,
                source_url=urljoin(self.config.homepage, url),
                title=title,
                organizer=organizer,
                summary=segment[:180] or "개발자 행사 정보. 상세 내용은 원문 확인 필요",
                body_text=f"{title} {segment}",
                source_kind=self.config.kind,
                source_priority=self.config.priority,
                recruit_start=start,
                recruit_end=end,
                event_start=event_start,
                event_end=event_end,
                date_kind="exact" if end else "unknown",
                original_category=segment,
                collected_at=now.isoformat(timespec="seconds"),
            ))
            if len(results) >= limit:
                break
        return results
