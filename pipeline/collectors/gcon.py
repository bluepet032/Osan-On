from __future__ import annotations

import html
import re
from datetime import datetime
from urllib.parse import urljoin

from pipeline.collectors.base import CollectorStructureError
from pipeline.collectors.html import StructuredHtmlCollector, dates_from_text, tag_text, with_query
from pipeline.models import RawOpportunity


ROW_RE = re.compile(r"<tr\b[^>]*>(?P<body>.*?)</tr>", re.I | re.S)
LINK_RE = re.compile(r'<a\s+href=["\'](?P<href>[^"\']*view\.do\?pbancSrnm=(?P<id>\d+)[^"\']*)["\'][^>]*>(?P<title>.*?)</a>', re.I | re.S)
CONTENT_RE = re.compile(
    r'<div\b[^>]*\bid=["\']content["\'][^>]*>(?P<body>.*?)'
    r'<div\b[^>]*\bclass=["\'][^"\']*\bbd-view-nav\b[^"\']*["\'][^>]*>', re.I | re.S,
)
FIELD_RE = re.compile(r"<dt\b[^>]*>(?P<label>.*?)</dt>\s*<dd\b[^>]*>(?P<value>.*?)</dd>", re.I | re.S)


class GconCollector(StructuredHtmlCollector):
    def _detail_item(self, markup: str, url: str, list_title: str, now: datetime) -> RawOpportunity:
        content = CONTENT_RE.search(markup)
        if not content:
            raise CollectorStructureError("경기콘텐츠진흥원 상세 공고 본문을 찾지 못했습니다")
        # Adjacent notices share #content; stop before their navigation links.
        body = content.group("body")
        item = super()._detail_item(body, url, list_title, now)
        fields: dict[str, str] = {}
        for field in FIELD_RE.finditer(body):
            label = tag_text(field.group("label"))
            value = tag_text(field.group("value"))
            if value:
                fields.setdefault(label, value)
        item.organizer = self.config.name
        for label in ("주최", "주관", "운영기관", "주최기관", "주관기관"):
            if label in fields:
                item.organizer = fields[label][:80]
                break
        for label in ("사업내용", "사업목적", "지원내용"):
            if label in fields:
                item.summary = fields[label][:180]
                break
        for label in ("접수기간", "신청기간", "모집기간"):
            if label in fields:
                start, end = dates_from_text(fields[label])
                if end and (not start or start <= end):
                    item.recruit_start, item.recruit_end, item.date_kind = start, end, "exact"
                    break
        item.benefits = fields.get("지원내용", "")[:100]
        return item

    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        results: list[RawOpportunity] = []
        seen: set[str] = set()
        for page in range(1, max(2, (limit + 14) // 15 + 1)):
            response = self.client.get(with_query(self.config.list_url, pageIndex=page))
            candidates: list[tuple[str, str, str]] = []
            for row in ROW_RE.finditer(response.text):
                link = LINK_RE.search(row.group("body"))
                state = tag_text(row.group("body"))
                if not link or "접수중" not in state or link.group("id") in seen:
                    continue
                seen.add(link.group("id"))
                title = tag_text(link.group("title"))
                candidates.append((urljoin(response.url, html.unescape(link.group("href"))), title, link.group("id")))
            if not candidates:
                break
            for url, title, post_id in candidates:
                detail = self.client.get(url)
                item = self._detail_item(detail.text, detail.url, title, now)
                item.source_post_id = post_id
                # GCON programs are for Gyeonggi; the generic "대상" label match picks up
                # unrelated sentences (e.g. exclusion rules), so it is not used as eligibility.
                item.location = "경기"
                item.eligibility = ""
                results.append(item)
                if len(results) >= limit:
                    return results
        if not results:
            raise CollectorStructureError("경기콘텐츠진흥원 접수중 사업공고를 찾지 못했습니다")
        return results
