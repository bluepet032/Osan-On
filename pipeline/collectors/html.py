from __future__ import annotations

import html
import json
import re
from datetime import date, datetime
from html.parser import HTMLParser
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlsplit, urlunsplit

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.http import RobotsDisallowed
from pipeline.models import RawOpportunity


OPPORTUNITY_WORDS = (
    "공모", "모집", "지원", "해커톤", "게임잼", "경진", "대회", "교육", "세미나",
    "컨퍼런스", "밋업", "서포터즈", "인턴", "채용", "프로그램", "전시", "contest",
    "hackathon", "conference", "game jam",
)
NAVIGATION_PHRASES = (
    "모임 찾기", "지원분야별 검색", "대회 참가 방법", "대회 참여 방법", "오시는길",
    "사업별사이트", "사업소개", "행사/세미나자료",
    "사업공고 |",
    "공모전/대회/지원사업",
)
DATE_RE = re.compile(r"(?P<year>20\d{2})[.\-/년\s]+(?P<month>\d{1,2})[.\-/월\s]+(?P<day>\d{1,2})")


class DocumentParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self.json_ld: list[str] = []
        self.metas: dict[str, str] = {}
        self.text_parts: list[str] = []
        self._href: str | None = None
        self._anchor_parts: list[str] = []
        self._script_json = False
        self._script_parts: list[str] = []
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag in {"script", "style", "noscript", "svg"}:
            self._ignored_depth += 1
        if tag == "script" and values.get("type", "").lower() == "application/ld+json":
            self._script_json = True
            self._script_parts = []
        if tag == "a" and values.get("href"):
            self._href = values["href"]
            self._anchor_parts = []
        if tag == "meta":
            key = values.get("property") or values.get("name")
            content = values.get("content")
            if key and content:
                self.metas[key.lower()] = content.strip()

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href:
            text = clean_text(" ".join(self._anchor_parts))
            if text:
                self.links.append((self._href, text))
            self._href = None
            self._anchor_parts = []
        if tag == "script":
            if self._script_json and self._script_parts:
                self.json_ld.append("".join(self._script_parts))
            self._script_json = False
            self._script_parts = []
        if tag in {"script", "style", "noscript", "svg"} and self._ignored_depth:
            self._ignored_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._script_json:
            self._script_parts.append(data)
        if self._href:
            self._anchor_parts.append(data)
        if not self._ignored_depth:
            value = clean_text(data)
            if value:
                self.text_parts.append(value)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


# Only real tags start with a letter; titles such as "<2027 작품 공모>" are kept.
TAG_RE = re.compile(r"</?[A-Za-z!][^>]*>")


def tag_text(markup: str) -> str:
    # Strip tags before unescaping, so a literal "&lt;title&gt;" in the text is kept.
    return clean_text(TAG_RE.sub(" ", markup))


def with_query(url: str, **params: str | int) -> str:
    """Return ``url`` with the given query parameters set, keeping the others."""

    parts = urlsplit(url)
    query = {key: values[-1] for key, values in parse_qs(parts.query).items()}
    query.update({key: str(value) for key, value in params.items()})
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def parse_date(value: str) -> str | None:
    match = DATE_RE.search(value or "")
    if not match:
        return None
    try:
        parsed = date(int(match["year"]), int(match["month"]), int(match["day"]))
        return parsed.isoformat()
    except ValueError:
        return None


def dates_from_text(value: str) -> tuple[str | None, str | None]:
    matches = list(DATE_RE.finditer(value or ""))
    dates = [parse_date(match.group(0)) for match in matches[:4]]
    dates = [item for item in dates if item]
    if not dates:
        return None, None
    if len(dates) == 1:
        return None, dates[0]
    return dates[0], dates[1]


PERIOD_LABEL_RE = re.compile(r"(?:접수|모집|신청|응모|공모|참가\s*신청|제출)\s*(?:기간|일정|마감일?)|마감일?")
RANGE_TAIL_RE = re.compile(
    r"^\s*(?:\([^)]{1,4}\))?\s*(?:\d{1,2}:\d{2})?\s*[~∼〜\-–]\s*"
    r"(?:(?P<year>20\d{2})[.\-/년\s]+)?(?P<month>\d{1,2})[.\-/월\s]+(?P<day>\d{1,2})"
)
LABEL_WINDOW = 80
MAX_RECRUIT_DAYS = 400


def plausible_period(start: str | None, end: str | None) -> bool:
    if not start or not end:
        return True
    span = (date.fromisoformat(end) - date.fromisoformat(start)).days
    return 0 <= span <= MAX_RECRUIT_DAYS


def _labeled_period(window: str) -> tuple[str | None, str | None]:
    match = DATE_RE.search(window)
    first = parse_date(match.group(0)) if match else None
    if not match or not first:
        return None, None
    tail = RANGE_TAIL_RE.match(window[match.end():])
    if not tail:
        # A single date after a period or deadline label is the deadline (e.g. "접수기간: ~ 2026.10.20").
        return None, first
    start = date.fromisoformat(first)
    month, day = int(tail["month"]), int(tail["day"])
    year = int(tail["year"]) if tail["year"] else start.year + (1 if month < start.month else 0)
    try:
        return first, date(year, month, day).isoformat()
    except ValueError:
        return None, None


def recruit_dates_from_text(text: str) -> tuple[str | None, str | None]:
    """Prefer dates right after a recruitment label over the first dates on the page.

    Detail pages often start with a posting or event date, so taking the first two dates
    of the whole page mislabels them as the recruitment period. Implausible periods
    (end before start, or longer than ``MAX_RECRUIT_DAYS``) are dropped so the item
    lands in the undated list instead of showing a wrong deadline.
    """

    for label in PERIOD_LABEL_RE.finditer(text or ""):
        start, end = _labeled_period(text[label.end():label.end() + LABEL_WINDOW])
        if end and plausible_period(start, end):
            return start, end
    start, end = dates_from_text(text)
    return (start, end) if plausible_period(start, end) else (None, None)


def first_value(document: dict, keys: tuple[str, ...]) -> str:
    for key in keys:
        value = document.get(key)
        if isinstance(value, str) and value.strip():
            return clean_text(value)
        if isinstance(value, dict):
            name = value.get("name")
            if isinstance(name, str):
                return clean_text(name)
    return ""


def iter_json_objects(value):
    if isinstance(value, dict):
        yield value
        for nested in value.values():
            yield from iter_json_objects(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from iter_json_objects(nested)


class StructuredHtmlCollector(Collector):
    """Conservative public-HTML collector using JSON-LD first and detail pages second."""

    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        response = self.client.get(self.config.list_url)
        parser = DocumentParser()
        parser.feed(response.text)
        items = self._json_ld_items(parser, now)
        if items:
            return items[:limit]

        candidates: list[tuple[str, str]] = []
        seen: set[str] = set()
        base_host = urlparse(response.url).netloc
        for href, title in parser.links:
            url = urljoin(response.url, href)
            if urlparse(url).netloc != base_host or url in seen:
                continue
            lower = title.casefold()
            if len(title) < 8 or not any(word in lower for word in OPPORTUNITY_WORDS):
                continue
            if any(phrase in title for phrase in NAVIGATION_PHRASES):
                continue
            if url.rstrip("/") == response.url.rstrip("/"):
                continue
            seen.add(url)
            candidates.append((url, title))
            if len(candidates) >= max(limit * 5, 20):
                break

        if not candidates:
            raise CollectorStructureError("목록에서 공고 링크 또는 JSON-LD Event를 찾지 못했습니다")

        results: list[RawOpportunity] = []
        for url, list_title in candidates:
            try:
                detail = self.client.get(url)
                item = self._detail_item(detail.text, detail.url, list_title, now)
                if any(phrase in item.title for phrase in NAVIGATION_PHRASES):
                    continue
                results.append(item)
            except RobotsDisallowed:
                raise
            except Exception:
                if not any(phrase in list_title for phrase in NAVIGATION_PHRASES):
                    results.append(self._fallback_item(url, list_title, now))
            if len(results) >= limit:
                break
        if not results:
            raise CollectorStructureError("공고 후보의 상세 페이지에서 유효한 항목을 찾지 못했습니다")
        return results

    def _json_ld_items(self, parser: DocumentParser, now: datetime) -> list[RawOpportunity]:
        results: list[RawOpportunity] = []
        for script in parser.json_ld:
            try:
                document = json.loads(script)
            except json.JSONDecodeError:
                continue
            for value in iter_json_objects(document):
                kind = value.get("@type")
                kinds = kind if isinstance(kind, list) else [kind]
                if not set(kinds) & {"Event", "EducationEvent", "BusinessEvent", "CreativeWork"}:
                    continue
                title = first_value(value, ("name", "headline"))
                url = first_value(value, ("url",))
                if not title or not url:
                    continue
                organizer = first_value(value, ("organizer", "provider", "sponsor"))
                start = parse_date(str(value.get("startDate", "")))
                end = parse_date(str(value.get("endDate", "")))
                results.append(self._raw(title, urljoin(self.config.list_url, url), organizer, first_value(value, ("description",)), start, end, now))
        return results

    def _detail_item(self, markup: str, url: str, list_title: str, now: datetime) -> RawOpportunity:
        parser = DocumentParser()
        parser.feed(markup)
        full_text = clean_text(" ".join(parser.text_parts))
        title = clean_text(parser.metas.get("og:title") or parser.metas.get("twitter:title") or list_title)
        if any(phrase in title for phrase in NAVIGATION_PHRASES) and not any(phrase in list_title for phrase in NAVIGATION_PHRASES):
            title = list_title
        for separator in (" | ", " - "):
            prefix, found, suffix = title.rpartition(separator)
            if found and self.config.name.casefold() in suffix.casefold():
                title = prefix
                break
        description = clean_text(parser.metas.get("description") or parser.metas.get("og:description") or "")
        start, end = recruit_dates_from_text(full_text)
        organizer = ""
        match = re.search(r"(?:주최|주관|기관|운영)\s*[:：]?\s*([^|·\n]{2,50})", full_text)
        if match:
            organizer = clean_text(match.group(1))[:80]
        if not description:
            description = self._extract_summary(full_text, title)
        item = self._raw(title, url, organizer, description, start, end, now)
        item.body_text = full_text[:6000]
        item.location = self._extract_label(full_text, "장소")
        item.eligibility = self._extract_label(full_text, "대상") or self._extract_label(full_text, "참가자격")
        item.benefits = self._extract_label(full_text, "혜택") or self._extract_label(full_text, "지원내용")
        return item

    def _fallback_item(self, url: str, title: str, now: datetime) -> RawOpportunity:
        return self._raw(title, url, "", "상세 정보는 원문 확인 필요", None, None, now)

    def _raw(self, title: str, url: str, organizer: str, summary: str, start: str | None, end: str | None, now: datetime) -> RawOpportunity:
        return RawOpportunity(
            source_id=self.config.id,
            source_name=self.config.name,
            source_url=url,
            title=title,
            organizer=organizer or self.config.name,
            summary=(summary or "상세 정보는 원문 확인 필요")[:180],
            source_kind=self.config.kind,
            source_priority=self.config.priority,
            recruit_start=start,
            recruit_end=end,
            date_kind="exact" if end else "unknown",
            collected_at=now.isoformat(timespec="seconds"),
        )

    @staticmethod
    def _extract_summary(text: str, title: str) -> str:
        without_title = text.replace(title, "", 1)
        for sentence in re.split(r"(?<=[.!?다])\s+|\s{2,}", without_title):
            sentence = clean_text(sentence)
            if 40 <= len(sentence) <= 220:
                return sentence[:180]
        return "상세 정보는 원문 확인 필요"

    @staticmethod
    def _extract_label(text: str, label: str) -> str:
        match = re.search(rf"{re.escape(label)}\s*[:：]?\s*([^|]{{2,100}})", text)
        return clean_text(match.group(1))[:100] if match else ""
