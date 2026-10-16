from __future__ import annotations

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from pipeline.config import ROOT, load_yaml
from pipeline.dates import status_for
from pipeline.models import Opportunity, RawOpportunity
from pipeline.normalize import clean_url, normalize


ALLOWED_FIELDS = {
    "title", "organizer", "summary", "application_url", "document_url", "recruit_start",
    "recruit_end", "event_start", "event_end", "date_kind", "eligibility", "benefits",
    "location", "mode", "fee", "primary_type", "field_tags", "audience_tags", "is_adjacent",
    "domain",
}
KST = ZoneInfo("Asia/Seoul")


def manual_items(taxonomy: dict, now: datetime, manual_dir: Path | None = None) -> list[Opportunity]:
    directory = manual_dir or ROOT / "manual"
    document = load_yaml(directory / "opportunities.yml")
    results: list[Opportunity] = []
    for item in document.get("items", []):
        raw = RawOpportunity(
            source_id="manual",
            source_name=item.get("source_name", "수동 등록"),
            source_url=item["source_url"],
            source_post_id=item.get("id"),
            title=item["title"],
            organizer=item.get("organizer", ""),
            summary=item.get("summary", ""),
            body_text=item.get("body_text", ""),
            source_kind="official" if item.get("is_official") else "aggregate",
            source_priority=120,
            application_url=item.get("application_url"),
            document_url=item.get("document_url"),
            recruit_start=item.get("recruit_start"),
            recruit_end=item.get("recruit_end"),
            date_kind=item.get("date_kind", "unknown"),
            eligibility=item.get("eligibility", ""),
            benefits=item.get("benefits", ""),
            location=item.get("location", ""),
            mode=item.get("mode", ""),
            fee=item.get("fee", "unknown"),
            collected_at=now.isoformat(timespec="seconds"),
        )
        opportunity = normalize(raw, taxonomy, now)
        for key in ALLOWED_FIELDS:
            if key in item:
                setattr(opportunity, key, item[key])
        opportunity.status, opportunity.d_day = status_for(
            opportunity.recruit_start, opportunity.recruit_end, opportunity.date_kind, now
        )
        opportunity.is_manual_reviewed = True
        if item.get("force_publish", True):
            opportunity.relevance.score = max(70, opportunity.relevance.score)
            opportunity.relevance.decision = "publish"
            opportunity.relevance.reasons.append("YAML 수동 승인")
        results.append(opportunity)
    return results


def apply_overrides(
    items: list[Opportunity],
    manual_dir: Path | None = None,
    now: datetime | None = None,
) -> list[Opportunity]:
    directory = manual_dir or ROOT / "manual"
    exclusions = load_yaml(directory / "exclusions.yml")
    excluded_ids = set(exclusions.get("ids", []))
    # Stored URLs went through clean_url, and a merged notice may be pasted from any of its sources.
    excluded_urls = {clean_url(url) for url in exclusions.get("source_urls", [])}
    filtered = [
        item for item in items
        if item.id not in excluded_ids
        and excluded_urls.isdisjoint({item.source_url, *(source.source_url for source in item.sources)})
    ]

    by_id = {item.id: item for item in filtered}
    by_url = {source.source_url: item for item in filtered for source in item.sources}
    overrides = load_yaml(directory / "overrides.yml")
    for patch in overrides.get("items", []):
        url = patch.get("source_url")
        target = by_id.get(patch.get("id")) or (by_url.get(clean_url(url)) if url else None)
        if not target:
            continue
        for key, value in patch.items():
            if key in ALLOWED_FIELDS:
                setattr(target, key, value)
        target.status, target.d_day = status_for(
            target.recruit_start,
            target.recruit_end,
            target.date_kind,
            now or datetime.now(KST),
        )
        if patch.get("force_publish"):
            target.relevance.score = max(70, target.relevance.score)
            target.relevance.decision = "publish"
            target.relevance.reasons.append("YAML 수동 승인")
        if patch.get("force_review"):
            target.relevance.score = min(69, max(50, target.relevance.score))
            target.relevance.decision = "review"
        target.is_manual_reviewed = True
    return filtered
