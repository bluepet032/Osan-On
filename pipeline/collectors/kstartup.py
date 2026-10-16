from __future__ import annotations

import re
from datetime import datetime, timedelta

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.collectors.html import tag_text, with_query
from pipeline.models import RawOpportunity


ITEM_RE = re.compile(r"<a\s+href=[\"']javascript:go_view\((?P<id>\d+)\);?[\"'][^>]*>(?P<body>.*?)</a>", re.I | re.S)
TITLE_RE = re.compile(r"<p\s+class=[\"']tit[\"'][^>]*>(?P<title>.*?)</p>", re.I | re.S)
DDAY_RE = re.compile(r"D-(\d+)", re.I)


class KStartupCollector(Collector):
    KEYWORDS = ("게임", "인디", "IT", "AI", "인공지능", "소프트웨어", "ICT", "콘텐츠", "디지털", "데이터", "앱", "웹", "XR", "보안", "스타트업")

    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        results: list[RawOpportunity] = []
        seen: set[str] = set()
        for page in range(1, max(2, (limit + 19) // 20 + 1)):
            for keyword in self.KEYWORDS:
                response = self.client.get(with_query(self.config.list_url, schStr=keyword, page=page))
                page_items = self._parse(response.text, now)
                for item in page_items:
                    if item.source_post_id in seen:
                        continue
                    seen.add(item.source_post_id or item.source_url)
                    results.append(item)
                if len(results) >= limit:
                    return results[:limit]
        if not results:
            raise CollectorStructureError("K-Startup 모집중 목록에서 공고 항목을 찾지 못했습니다")
        return results[:limit]

    def _parse(self, markup: str, now: datetime) -> list[RawOpportunity]:
        results: list[RawOpportunity] = []
        for match in ITEM_RE.finditer(markup):
            title_match = TITLE_RE.search(match.group("body"))
            if not title_match:
                continue
            title = tag_text(title_match.group("title"))
            dday = DDAY_RE.search(match.group("body"))
            if not dday:
                continue
            end = (now.date() + timedelta(days=int(dday.group(1)))).isoformat()
            post_id = match.group("id")
            results.append(RawOpportunity(
                source_id=self.config.id, source_name=self.config.name,
                source_url=with_query(self.config.list_url, schM="view", pbancSn=post_id),
                source_post_id=post_id, title=title, organizer=self.config.name,
                summary="K-Startup 모집중 창업지원 공고", body_text=title,
                source_kind=self.config.kind, source_priority=self.config.priority,
                recruit_end=end, date_kind="exact",
                original_category="창업지원", collected_at=now.isoformat(timespec="seconds"),
            ))
        return results
