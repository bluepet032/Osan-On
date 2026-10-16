from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urljoin

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.collectors.html import dates_from_text, tag_text
from pipeline.models import RawOpportunity


ROW_RE = re.compile(r"<tr\b[^>]*>(?P<body>.*?)</tr>", re.I | re.S)
LINK_RE = re.compile(r'<a\s+href=["\'](?P<href>/home/2-2/(?P<id>\d+))["\'][^>]*>(?P<title>.*?)</a>', re.I | re.S)


class NipaCollector(Collector):
    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        response = self.client.get(self.config.list_url)
        results: list[RawOpportunity] = []
        for row in ROW_RE.finditer(response.text):
            link = LINK_RE.search(row.group("body"))
            if not link:
                continue
            body = tag_text(row.group("body"))
            title = tag_text(link.group("title"))
            start, end = dates_from_text(body)
            results.append(RawOpportunity(
                source_id=self.config.id, source_name=self.config.name,
                source_url=urljoin(response.url, link.group("href")), source_post_id=link.group("id"),
                title=title, organizer=self.config.name, summary="정보통신산업진흥원 공식 사업공고",
                body_text=f"{body} 웹/모바일/IT 소프트웨어 AI", source_kind=self.config.kind,
                source_priority=self.config.priority, recruit_start=start, recruit_end=end,
                date_kind="exact" if end else "unknown", original_category="웹/모바일/IT · 소프트웨어 · AI",
                collected_at=now.isoformat(timespec="seconds"),
            ))
            if len(results) >= limit:
                break
        if not results:
            raise CollectorStructureError("NIPA 사업공고 표에서 항목을 찾지 못했습니다")
        return results
