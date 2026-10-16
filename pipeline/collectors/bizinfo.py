from __future__ import annotations

import html
import re
from datetime import datetime
from urllib.parse import parse_qs, urljoin, urlsplit

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.collectors.html import dates_from_text, tag_text, with_query
from pipeline.http import FetchError, RobotsDisallowed
from pipeline.models import RawOpportunity


ROW_RE = re.compile(r"<tr\b[^>]*>(?P<body>.*?)</tr>", re.I | re.S)
CELL_RE = re.compile(r"<td\b[^>]*>(?P<body>.*?)</td>", re.I | re.S)
LINK_RE = re.compile(
    r'<a\s+href\s*=\s*["\'](?P<href>[^"\']*(?:selectSIIA200Detail|selectSIEA430Detail)\.do[^"\']*)["\'][^>]*>(?P<title>.*?)</a>',
    re.I | re.S,
)


class BizinfoCollector(Collector):
    """Collect public Bizinfo support notices and events without an API key."""

    KEYWORDS = (
        "게임", "인디", "IT", "AI", "인공지능", "소프트웨어", "SW", "ICT",
        "콘텐츠", "디지털", "데이터", "앱", "웹", "메타버스", "VR", "XR",
        "클라우드", "보안", "블록체인", "스타트업", "창업", "반도체", "로봇",
    )

    # Searches are many small requests; tolerate a few timeouts instead of failing the source,
    # but give up (keeping the last good data) when too many fail to trust a partial result.
    MAX_FAILED_SEARCHES = 3
    MAX_FAILED_RATIO = 0.2

    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        self._attempts = 0
        self._failures: list[str] = []
        support_limit = max(1, round(limit * 0.67))
        event_limit = max(1, limit - support_limit)
        support_url = self.config.list_url
        event_url = urljoin(support_url, "/sie/siea/selectSIEA430View.do")
        results = self._collect_searches(support_url, "support", support_limit, now)
        results.extend(self._collect_searches(event_url, "event", event_limit, now))
        if len(self._failures) > max(self.MAX_FAILED_SEARCHES, self._attempts * self.MAX_FAILED_RATIO):
            raise FetchError(
                f"기업마당 검색 {self._attempts}회 중 {len(self._failures)}회 실패: {self._failures[0]}"
            )
        if not results:
            raise CollectorStructureError("기업마당 공개 지원사업·행사 검색에서 항목을 찾지 못했습니다")
        return results[:limit]

    def _collect_searches(self, base_url: str, kind: str, target: int, now: datetime) -> list[RawOpportunity]:
        results: list[RawOpportunity] = []
        seen: set[str] = set()
        exhausted: set[str] = set()
        for page in range(1, 6):
            for keyword in self.KEYWORDS:
                if keyword in exhausted:
                    continue
                if kind == "support":
                    params = {
                        "rowsSel": 6, "rows": 15, "cpage": page, "schEndAt": "N",
                        "condition": "searchPblancNm", "condition1": "AND",
                        "preKeywords": keyword, "keyword": keyword,
                    }
                else:
                    params = {"rows": 15, "cpage": page, "condition": "TITLE", "keyword": keyword}
                self._attempts += 1
                try:
                    response = self.client.get(with_query(base_url, **params))
                except RobotsDisallowed:
                    raise
                except FetchError as error:
                    self._failures.append(str(error)[:200])
                    continue
                page_items = self._parse_rows(response.text, response.url, kind, keyword, now)
                new_items = [item for item in page_items if item.source_post_id not in seen]
                if not page_items:
                    exhausted.add(keyword)
                for item in new_items:
                    seen.add(item.source_post_id or item.source_url)
                    results.append(item)
                if len(results) >= target:
                    return results[:target]
            if len(exhausted) == len(self.KEYWORDS):
                break
        return results[:target]

    def _parse_rows(self, markup: str, base_url: str, kind: str, keyword: str, now: datetime) -> list[RawOpportunity]:
        results: list[RawOpportunity] = []
        for row in ROW_RE.finditer(markup):
            body = row.group("body")
            link = LINK_RE.search(body)
            if not link:
                continue
            cells = [tag_text(cell.group("body")) for cell in CELL_RE.finditer(body)]
            if kind == "support" and len(cells) >= 7:
                category, period, organizer = cells[1], cells[3], cells[5]
                id_key = "pblancId"
                type_hint = "지원사업"
            elif kind == "event" and len(cells) >= 6:
                category, period, organizer = "행사정보", cells[3], cells[4]
                id_key = "eventInfoId"
                type_hint = "행사"
            else:
                continue
            source_url = urljoin(base_url, html.unescape(link.group("href")))
            post_id = (parse_qs(urlsplit(source_url).query).get(id_key) or [source_url])[0]
            start, end = dates_from_text(period)
            results.append(RawOpportunity(
                source_id=self.config.id,
                source_name=self.config.name,
                source_url=source_url,
                source_post_id=post_id,
                title=re.sub(r"\s*페이지(?:로)?\s*이동$", "", tag_text(link.group("title"))),
                organizer=organizer or self.config.name,
                summary=f"기업마당 공개 {type_hint} · {category} · 검색어 {keyword}",
                body_text=f"{category} {keyword}",
                source_kind=self.config.kind,
                source_priority=self.config.priority,
                recruit_start=start,
                recruit_end=end,
                date_kind="exact" if end else "unknown",
                original_category=category,
                collected_at=now.isoformat(timespec="seconds"),
            ))
        return results
