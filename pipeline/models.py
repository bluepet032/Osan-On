from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Literal


OpportunityStatus = Literal[
    "upcoming", "open", "urgent", "today", "closed", "ongoing", "unknown"
]
OpportunityType = Literal[
    "contest", "support", "hackathon", "event", "education", "supporters", "employment", "other"
]
DateKind = Literal["exact", "ongoing", "first_come", "budget", "unknown", "inquiry"]
# "it" is the original IT·게임 scope; the others come from taxonomy.yml `domains`.
Domain = Literal["it", "design_media", "literature_arts", "planning_ideas", "business"]


@dataclass(slots=True)
class SourceRecord:
    source_id: str
    source_name: str
    source_url: str
    source_post_id: str | None = None
    kind: str = "aggregate"
    priority: int = 40
    fetched_at: str | None = None


@dataclass(slots=True)
class RawOpportunity:
    source_id: str
    source_name: str
    source_url: str
    title: str
    organizer: str = ""
    summary: str = ""
    body_text: str = ""
    source_post_id: str | None = None
    source_kind: str = "aggregate"
    source_priority: int = 40
    application_url: str | None = None
    document_url: str | None = None
    recruit_start: str | None = None
    recruit_end: str | None = None
    event_start: str | None = None
    event_end: str | None = None
    date_kind: DateKind = "unknown"
    eligibility: str = ""
    benefits: str = ""
    location: str = ""
    mode: str = ""
    fee: str = "unknown"
    original_category: str = ""
    collected_at: str | None = None


@dataclass(slots=True)
class Relevance:
    score: int
    reasons: list[str]
    decision: Literal["publish", "review", "exclude"]


@dataclass(slots=True)
class Opportunity:
    id: str
    title: str
    source_name: str
    source_url: str
    organizer: str
    summary: str
    primary_type: OpportunityType
    field_tags: list[str]
    audience_tags: list[str]
    status: OpportunityStatus
    relevance: Relevance
    first_seen_at: str
    last_seen_at: str
    sources: list[SourceRecord] = field(default_factory=list)
    application_url: str | None = None
    document_url: str | None = None
    recruit_start: str | None = None
    recruit_end: str | None = None
    event_start: str | None = None
    event_end: str | None = None
    date_kind: DateKind = "unknown"
    d_day: int | None = None
    eligibility: str = ""
    benefits: str = ""
    location: str = ""
    mode: str = ""
    fee: str = "unknown"
    is_adjacent: bool = False
    domain: Domain = "it"
    # Advanced-filter facts (see pipeline/facets.py). Empty / None means the source did not say.
    regions: list[str] = field(default_factory=list)
    prize_manwon: int | None = None
    last_changed_at: str | None = None
    change_flags: list[str] = field(default_factory=list)
    is_manual_reviewed: bool = False
    dedupe_key: str = ""

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["relevance"] = asdict(self.relevance)
        data["sources"] = [asdict(source) for source in self.sources]
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Opportunity":
        copy = dict(data)
        copy["relevance"] = Relevance(**copy["relevance"])
        copy["sources"] = [SourceRecord(**item) for item in copy.get("sources", [])]
        return cls(**copy)


@dataclass(slots=True)
class CrawlStatus:
    source_id: str
    source_name: str
    status: Literal["success", "failed", "skipped"]
    started_at: str
    finished_at: str
    collected_count: int = 0
    published_count: int = 0
    review_count: int = 0
    new_count: int = 0
    changed_count: int = 0
    consecutive_failures: int = 0
    last_success_at: str | None = None
    error: str | None = None
    # Item count of the previous successful run, used to detect sudden collection drops.
    previous_collected_count: int | None = None
    # Share of collected items carrying each advanced-filter fact (pipeline/facets.py), and
    # the same for the previous successful run, used to detect a collector losing a field.
    facet_coverage: dict[str, float] | None = None
    previous_facet_coverage: dict[str, float] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def iso_now(now: datetime) -> str:
    return now.isoformat(timespec="seconds")

