"""Normalize the facts used by the site's advanced filters: region, attendance mode, fee
and prize money.

Collectors pass what a source states in the plain RawOpportunity fields (``location``,
``mode``, ``fee``, ``benefits``, ``original_category``). These helpers only read explicit
statements; when a source says nothing the value stays unknown rather than guessed, and
the site tells users how many items were left out for lack of information.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from pipeline.classification import AUDIENCE_LABELS
from pipeline.models import Opportunity, RawOpportunity


NATIONWIDE = "전국"
# Short names are what the site shows; aliases are the spellings sources use.
REGIONS: dict[str, tuple[str, ...]] = {
    "서울": ("서울", "서울특별시", "서울시"),
    "부산": ("부산", "부산광역시", "부산시"),
    "대구": ("대구", "대구광역시", "대구시"),
    "인천": ("인천", "인천광역시", "인천시"),
    "광주": ("광주", "광주광역시"),
    "대전": ("대전", "대전광역시", "대전시"),
    "울산": ("울산", "울산광역시", "울산시"),
    "세종": ("세종", "세종특별자치시", "세종시"),
    "경기": ("경기", "경기도"),
    "강원": ("강원", "강원도", "강원특별자치도"),
    "충북": ("충북", "충청북도"),
    "충남": ("충남", "충청남도"),
    "전북": ("전북", "전라북도", "전북특별자치도"),
    "전남": ("전남", "전라남도"),
    "경북": ("경북", "경상북도"),
    "경남": ("경남", "경상남도"),
    "제주": ("제주", "제주도", "제주특별자치도"),
}
ALIASES = {alias: name for name, aliases in REGIONS.items() for alias in aliases}
ALIASES.update({NATIONWIDE: NATIONWIDE, "전 지역": NATIONWIDE})
# Joint notices written as one word, e.g. "[전남광주] …".
COMBINED = {"전남광주": ("전남", "광주"), "광주전남": ("광주", "전남"), "대구경북": ("대구", "경북"), "부울경": ("부산", "울산", "경남")}

# "[경남ㆍ부산ㆍ울산] 2026년 …" — a leading bracket that holds only region names.
TITLE_PREFIX_RE = re.compile(r"^\s*[\[【]([^\]】]{1,40})[\]】]")
REGION_SPLIT_RE = re.compile(r"\s*[ㆍ·,/]\s*|\s+")
# Dev-Event writes "오프라인(서울 서초구)".
OFFLINE_PLACE_RE = re.compile(r"오프라인\s*\(([^)]*)\)")

# Attendance and fee markers must be explicit: "온라인 쇼핑몰 지원" is about an online shop,
# not an online event, so plain "온라인" inside a title is not enough.
ONLINE_RE = re.compile(r"[\[(]\s*온라인\s*[\])]|비대면|웨비나|webinar|온라인\s*(?:개최|진행|설명회|세미나|특강|강연|교육|행사)", re.I)
OFFLINE_RE = re.compile(r"[\[(]\s*오프라인\s*[\])]|오프라인\s*(?:개최|진행|행사)")
HYBRID_RE = re.compile(r"온\s*[·/]\s*오프라인|온오프라인|하이브리드|hybrid", re.I)
FREE_RE = re.compile(r"[\[(]\s*무료\s*[\])]|무료\s*(?:특강|교육|강연|세미나|참가|참여|행사)|참가비\s*(?:무료|없음)")
PAID_RE = re.compile(r"[\[(]\s*유료\s*[\])]|참가비\s*[:：]?\s*[\d,]+\s*원|유료\s*(?:특강|교육|강연|세미나|행사)")

PRIZE_WORD_RE = re.compile(r"상금|시상금|총상금")
AMOUNT_RE = re.compile(
    r"(?:(?P<eok>\d+(?:\.\d+)?)\s*억)?\s*(?:(?P<cheon>\d+)\s*천)?\s*(?:(?P<man>[\d,]+(?:\.\d+)?)\s*)?만\s*원"
    r"|(?P<eok_only>\d+(?:\.\d+)?)\s*억\s*원"
)
RANGE_RE = re.compile(r"([\d,]+)\s*[~∼〜\-]\s*([\d,]+)\s*만\s*원")
# Some sources give the prize in won without a unit: "상금 2000000".
PLAIN_WON_RE = re.compile(r"상금\s*[:：]?\s*([\d,]{5,})\s*원?(?![\d,]*\s*만)")


@dataclass(slots=True)
class Facets:
    regions: list[str] = field(default_factory=list)
    mode: str = ""
    fee: str = "unknown"
    prize_manwon: int | None = None


def _region(token: str) -> str | None:
    token = token.strip()
    if token in ALIASES:
        return ALIASES[token]
    # "서울 강남구", "부산시 해운대구": the first word carries the region.
    first = token.split(" ")[0] if token else ""
    return ALIASES.get(first)


def regions_from_title(title: str) -> list[str]:
    match = TITLE_PREFIX_RE.match(title or "")
    if not match:
        return []
    names: list[str] = []
    for part in (part for part in REGION_SPLIT_RE.split(match.group(1)) if part):
        if part in COMBINED:
            names.extend(COMBINED[part])
            continue
        name = _region(part)
        # "[부산 동구청]" names an organizer, not a region list, so every part must be a region.
        if name is None:
            return []
        names.append(name)
    return list(dict.fromkeys(names))


def regions_from_location(location: str) -> list[str]:
    names: list[str] = []
    for part in re.split(r"\s*[,/ㆍ·]\s*", location or ""):
        name = _region(part)
        if name:
            names.append(name)
    return list(dict.fromkeys(names))


def parse_manwon(text: str) -> int | None:
    """Largest money amount in ``text`` in units of 10,000 won, or None."""

    amounts: list[float] = []
    for won in PLAIN_WON_RE.findall(text or ""):
        amounts.append(float(won.replace(",", "")) / 10000)
    for low, high in RANGE_RE.findall(text or ""):
        amounts.append(float(high.replace(",", "")))
    for match in AMOUNT_RE.finditer(text or ""):
        if match.group("eok_only"):
            amounts.append(float(match.group("eok_only")) * 10000)
            continue
        eok = float(match.group("eok") or 0)
        cheon = float(match.group("cheon") or 0)
        man = float((match.group("man") or "0").replace(",", ""))
        value = eok * 10000 + cheon * 1000 + man
        if value:
            amounts.append(value)
    return int(max(amounts)) if amounts else None


def prize_from(raw: RawOpportunity) -> int | None:
    """Prize money in 만원; 0 means a prize is mentioned without an amount."""

    # Only amounts next to the word "상금" count: "최대 2,000만원 지원" is funding, not a prize.
    # Collectors that know the prize put it in `benefits` as "상금 …".
    mentioned = False
    for text in (raw.benefits, raw.title, raw.summary):
        for match in PRIZE_WORD_RE.finditer(text or ""):
            mentioned = True
            amount = parse_manwon(text[match.start():match.start() + 40])
            if amount:
                return amount
    return 0 if mentioned else None


def extract_facets(raw: RawOpportunity) -> Facets:
    text = " ".join(part for part in (raw.title, raw.original_category, raw.location) if part)

    regions = regions_from_location(raw.location) or regions_from_title(raw.title)
    for place in OFFLINE_PLACE_RE.findall(raw.original_category or ""):
        regions.extend(name for name in regions_from_location(place) if name not in regions)

    mode = raw.mode if raw.mode in {"online", "offline", "hybrid"} else ""
    if not mode:
        category = raw.original_category or ""
        online = bool(ONLINE_RE.search(text)) or bool(re.search(r"(?:^|[\s,·])온라인(?:$|[\s,·])", category))
        offline = bool(OFFLINE_RE.search(text)) or "오프라인" in category
        if HYBRID_RE.search(text) or (online and offline):
            mode = "hybrid"
        elif online:
            mode = "online"
        elif offline:
            mode = "offline"

    fee = raw.fee if raw.fee in {"free", "paid"} else "unknown"
    if fee == "unknown":
        category = raw.original_category or ""
        if FREE_RE.search(text) or re.search(r"(?:^|[\s,·])무료(?:$|[\s,·])", category):
            fee = "free"
        elif PAID_RE.search(text) or re.search(r"(?:^|[\s,·])유료(?:$|[\s,·])", category):
            fee = "paid"

    return Facets(regions=regions, mode=mode, fee=fee, prize_manwon=prize_from(raw))


# Keys match the site's advanced filters (src/advancedFilters.ts).
FACET_KEYS = ("region", "mode", "fee", "audience", "prize")
AUDIENCE_NAMES = frozenset(AUDIENCE_LABELS.values())


def has_facet(item: Opportunity, key: str) -> bool:
    """Whether ``item`` states the fact behind one advanced filter."""

    if key == "region":
        return bool(item.regions)
    if key == "mode":
        return item.mode in {"online", "offline", "hybrid"}
    if key == "fee":
        return item.fee in {"free", "paid"}
    if key == "audience":
        return not AUDIENCE_NAMES.isdisjoint(item.audience_tags)
    if key == "prize":
        return item.prize_manwon is not None
    raise ValueError(f"unknown facet: {key}")


def facet_coverage(items: list[Opportunity]) -> dict[str, float] | None:
    """Share of ``items`` that carry each advanced-filter fact, or None without items."""

    if not items:
        return None
    return {key: round(sum(has_facet(item, key) for item in items) / len(items), 3) for key in FACET_KEYS}
