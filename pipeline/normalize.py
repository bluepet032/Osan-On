from __future__ import annotations

import hashlib
import re
from datetime import datetime
from urllib.parse import urlsplit, urlunsplit

from pipeline.classification import assign_domain, classify
from pipeline.dates import status_for
from pipeline.facets import extract_facets
from pipeline.models import Opportunity, RawOpportunity, SourceRecord


TRACKING_KEYS = ("utm_", "fbclid", "gclid")


def clean_url(value: str) -> str:
    parts = urlsplit(value.strip())
    pairs = []
    for pair in parts.query.split("&"):
        key = pair.split("=", 1)[0].casefold()
        if pair and not any(key.startswith(prefix) for prefix in TRACKING_KEYS):
            pairs.append(pair)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/") or "/", "&".join(pairs), ""))


def normalize_text(value: str) -> str:
    return re.sub(r"[^0-9a-z가-힣]+", "", value.casefold())


def stable_id(raw: RawOpportunity) -> str:
    identity = f"{raw.source_id}:{raw.source_post_id or clean_url(raw.source_url)}"
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20]


def summarize(raw: RawOpportunity) -> str:
    value = re.sub(r"\s+", " ", raw.summary or "").strip()
    if not value or value == raw.title:
        value = "지원 대상과 세부 내용은 원문 확인 필요"
    if len(value) < 60:
        prefix = raw.eligibility or raw.benefits
        if prefix:
            value = f"{value}. {prefix}"
    if len(value) < 60:
        value = f"{value}. 참가 조건, 세부 일정, 제출 항목과 신청 방법은 주최기관의 최신 원문 공고에서 반드시 확인하세요."
    return value[:180]


def normalize(raw: RawOpportunity, taxonomy: dict, now: datetime) -> Opportunity:
    primary_type, fields, audiences, relevance, adjacent = classify(raw, taxonomy)
    domain, topics, relevance = assign_domain(raw, taxonomy, relevance)
    facets = extract_facets(raw)
    if domain != "it":
        # IT sub-field tags are noise outside the IT tab; show the field's own topics instead.
        fields = topics
    status, d_day = status_for(raw.recruit_start, raw.recruit_end, raw.date_kind, now)
    timestamp = raw.collected_at or now.isoformat(timespec="seconds")
    source_url = clean_url(raw.source_url)
    organizer = re.sub(r"\s+", " ", raw.organizer).strip() or raw.source_name
    dedupe_key = "|".join([
        normalize_text(raw.title), normalize_text(organizer), raw.recruit_end or "",
    ])
    title = re.sub(r"^[>｜|·\s]+", "", re.sub(r"\s+", " ", raw.title)).strip()
    return Opportunity(
        id=stable_id(raw),
        title=title,
        source_name=raw.source_name,
        source_url=source_url,
        organizer=organizer,
        summary=summarize(raw),
        primary_type=primary_type,  # type: ignore[arg-type]
        field_tags=fields,
        audience_tags=audiences,
        status=status,
        relevance=relevance,
        first_seen_at=timestamp,
        last_seen_at=timestamp,
        sources=[SourceRecord(
            source_id=raw.source_id,
            source_name=raw.source_name,
            source_url=source_url,
            source_post_id=raw.source_post_id,
            kind=raw.source_kind,
            priority=raw.source_priority,
            fetched_at=timestamp,
        )],
        application_url=clean_url(raw.application_url) if raw.application_url else None,
        document_url=clean_url(raw.document_url) if raw.document_url else None,
        recruit_start=raw.recruit_start,
        recruit_end=raw.recruit_end,
        event_start=raw.event_start,
        event_end=raw.event_end,
        date_kind=raw.date_kind,
        d_day=d_day,
        eligibility=raw.eligibility[:240],
        benefits=raw.benefits[:240],
        location=raw.location[:120],
        mode=facets.mode,
        fee=facets.fee,
        is_adjacent=adjacent,
        domain=domain,  # type: ignore[arg-type]
        regions=facets.regions,
        prize_manwon=facets.prize_manwon,
        dedupe_key=dedupe_key,
    )
