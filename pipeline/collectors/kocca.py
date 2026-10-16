from __future__ import annotations

import html
import re
from datetime import date, datetime
from urllib.parse import parse_qs, urljoin, urlsplit

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.collectors.html import tag_text, with_query
from pipeline.models import RawOpportunity


ROW_RE = re.compile(r"<tr\b[^>]*>(?P<body>.*?)</tr>", re.I | re.S)
LINK_RE = re.compile(r'<a\s+href=["\'](?P<href>[^"\']*pims/view\.do[^"\']*)["\'][^>]*>(?P<title>.*?)</a>', re.I | re.S)
CELL_RE = re.compile(r"<td\b[^>]*>(?P<body>.*?)</td>", re.I | re.S)
SHORT_DATE_RE = re.compile(r"(?<!\d)(?P<year>\d{2})\.(?P<month>\d{1,2})\.(?P<day>\d{1,2})(?!\d)")


def _short_dates(value: str) -> list[str]:
    results: list[str] = []
    for match in SHORT_DATE_RE.finditer(value):
        try:
            results.append(date(2000 + int(match["year"]), int(match["month"]), int(match["day"])).isoformat())
        except ValueError:
            continue
    return results


class KoccaCollector(Collector):
    """Parse the current KOCCA support-notice table and its exact application period."""

    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        results: list[RawOpportunity] = []
        seen: set[str] = set()
        max_pages = max(2, (limit + 9) // 10 + 1)
        for page in range(1, max_pages + 1):
            response = self.client.get(with_query(self.config.list_url, pageIndex=page))
            page_items = self._parse_page(response.text, response.url, now)
            new_items = [item for item in page_items if item.source_post_id not in seen]
            if not new_items:
                break
            for item in new_items:
                seen.add(item.source_post_id or item.source_url)
                results.append(item)
            if len(results) >= limit:
                return results[:limit]
        if not results:
            raise CollectorStructureError("KOCCA 지원공고 표에서 항목을 찾지 못했습니다")
        return results[:limit]

    def _parse_page(self, markup: str, base_url: str, now: datetime) -> list[RawOpportunity]:
        results: list[RawOpportunity] = []
        for row in ROW_RE.finditer(markup):
            body = row.group("body")
            link = LINK_RE.search(body)
            if not link:
                continue
            cells = [tag_text(cell.group("body")) for cell in CELL_RE.finditer(body)]
            if len(cells) < 4:
                continue
            source_url = urljoin(base_url, html.unescape(link.group("href")))
            post_id = (parse_qs(urlsplit(source_url).query).get("intcNo") or [source_url])[0]
            period_dates = _short_dates(cells[-2])
            start = period_dates[0] if period_dates else None
            end = period_dates[1] if len(period_dates) > 1 else (period_dates[0] if period_dates else None)
            category = cells[0]
            results.append(RawOpportunity(
                source_id=self.config.id,
                source_name=self.config.name,
                source_url=source_url,
                source_post_id=post_id,
                title=tag_text(link.group("title")),
                organizer=self.config.name,
                summary=f"한국콘텐츠진흥원 공식 {category or '지원'} 공고",
                body_text="디지털 콘텐츠 산업 지원",
                source_kind=self.config.kind,
                source_priority=self.config.priority,
                recruit_start=start,
                recruit_end=end,
                date_kind="exact" if end else "unknown",
                original_category=f"디지털 콘텐츠 · {category}".strip(" ·"),
                collected_at=now.isoformat(timespec="seconds"),
            ))
        return results
