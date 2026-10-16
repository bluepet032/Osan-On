from __future__ import annotations

import html
import re
from datetime import datetime
from urllib.parse import parse_qs, urljoin, urlsplit

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.collectors.html import parse_date, tag_text
from pipeline.models import RawOpportunity


ROW_RE = re.compile(r'<tr\s+id="tr_\d+"[^>]*>(?P<body>.*?)</tr>', re.I | re.S)
CELL_RE = re.compile(r"<td\b[^>]*>(?P<body>.*?)</td>", re.I | re.S)
LINK_RE = re.compile(r'<a\s+href="(?P<href>[^"]*ViewType=detail[^"]*)"[^>]*>(?P<title>.*?)</a>', re.I | re.S)


class Momo365Collector(Collector):
    """Read the public support-notice table on momo365.

    Detail pages hold the notice as images and repeat other notices in a sidebar, so the
    generic collector picked up unrelated text. The list table already has the title,
    organizer, region and dates. Pagination is script-driven and is not emulated.
    """

    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        response = self.client.get(self.config.list_url)
        results: list[RawOpportunity] = []
        for row in ROW_RE.finditer(response.text):
            body = row.group("body")
            link = LINK_RE.search(body)
            cells = [tag_text(cell.group("body")) for cell in CELL_RE.finditer(body)]
            if not link or len(cells) < 8:
                continue
            # cells[6] is the posting date, not the start of applications, so it is not used.
            title, organizer, region, deadline = cells[2], cells[3], cells[4], cells[7]
            source_url = urljoin(response.url, html.unescape(link.group("href")))
            post_id = (parse_qs(urlsplit(source_url).query).get("seq") or [None])[0]
            end = parse_date(deadline)
            results.append(RawOpportunity(
                source_id=self.config.id,
                source_name=self.config.name,
                source_url=source_url,
                source_post_id=post_id,
                title=title,
                organizer=organizer or self.config.name,
                summary=f"모모365 공모사업 공고 · {organizer or '주최기관 미상'} · {region or '지역 미상'}",
                source_kind=self.config.kind,
                source_priority=self.config.priority,
                recruit_end=end,
                date_kind="exact" if end else "unknown",
                location=region,
                collected_at=now.isoformat(timespec="seconds"),
            ))
            if len(results) >= limit:
                break
        if not results:
            raise CollectorStructureError("모모365 공모사업 목록에서 공고 행을 찾지 못했습니다")
        return results
