from __future__ import annotations

from datetime import date
from difflib import SequenceMatcher

from pipeline.models import Opportunity
from pipeline.normalize import normalize_text


def similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, normalize_text(left), normalize_text(right)).ratio()


def date_distance(left: str | None, right: str | None) -> int | None:
    if not left or not right:
        return None
    try:
        return abs((date.fromisoformat(left[:10]) - date.fromisoformat(right[:10])).days)
    except ValueError:
        return None


def distinct_posts_of_same_source(left: Opportunity, right: Opportunity) -> bool:
    """True when one source lists differently titled items under different post IDs.

    Similar but not identical titles within one source are separate tracks of a series
    (e.g. "SW부문" and "AI부문") and must not be merged by fuzzy matching. Identically
    titled reposts on the same source are still treated as duplicates.
    """

    if normalize_text(left.title) == normalize_text(right.title):
        return False
    left_posts = {source.source_id: source.source_post_id for source in left.sources if source.source_post_id}
    right_posts = {source.source_id: source.source_post_id for source in right.sources if source.source_post_id}
    return any(left_posts[source_id] != right_posts[source_id] for source_id in left_posts.keys() & right_posts.keys())


def is_duplicate(left: Opportunity, right: Opportunity) -> bool:
    if left.id == right.id:
        return True
    left_urls = {source.source_url for source in left.sources}
    right_urls = {source.source_url for source in right.sources}
    if left_urls & right_urls:
        return True
    if left.application_url and left.application_url == right.application_url:
        return True
    if left.dedupe_key and left.dedupe_key == right.dedupe_key:
        return True
    if distinct_posts_of_same_source(left, right):
        return False
    distance = date_distance(left.recruit_end, right.recruit_end)
    left_source_ids = {source.source_id for source in left.sources}
    right_source_ids = {source.source_id for source in right.sources}
    cross_source = left_source_ids.isdisjoint(right_source_ids)
    title_similarity = similarity(left.title, right.title)
    return (
        title_similarity >= 0.90
        and distance is not None
        and distance <= 1
        and (cross_source or similarity(left.organizer, right.organizer) >= 0.80)
    )


def merge(left: Opportunity, right: Opportunity) -> Opportunity:
    all_sources = {source.source_url: source for source in [*left.sources, *right.sources]}
    representative = max(all_sources.values(), key=lambda source: source.priority)
    winner = left if any(source.source_url == representative.source_url for source in left.sources) else right
    other = right if winner is left else left
    winner.sources = sorted(all_sources.values(), key=lambda source: (-source.priority, source.source_name))
    winner.source_name = representative.source_name
    winner.source_url = representative.source_url
    winner.application_url = winner.application_url or other.application_url
    winner.document_url = winner.document_url or other.document_url
    winner.eligibility = winner.eligibility or other.eligibility
    winner.benefits = winner.benefits or other.benefits
    winner.location = winner.location or other.location
    winner.field_tags = sorted(set(winner.field_tags + other.field_tags))
    winner.audience_tags = sorted(set(winner.audience_tags + other.audience_tags))
    winner.relevance.score = max(winner.relevance.score, other.relevance.score)
    winner.relevance.reasons = list(dict.fromkeys(winner.relevance.reasons + other.relevance.reasons))
    if winner.relevance.score >= 70:
        winner.relevance.decision, winner.domain = "publish", "it"
    else:
        # Below the IT threshold, keep a copy that was published in another field tab.
        tabbed = next((item for item in (winner, other) if item.domain != "it" and item.relevance.decision == "publish"), None)
        if tabbed:
            winner.relevance.decision, winner.domain = "publish", tabbed.domain
            winner.field_tags = sorted(set(tabbed.field_tags))
        else:
            winner.relevance.decision = "review" if winner.relevance.score >= 50 else "exclude"
    winner.first_seen_at = min(winner.first_seen_at, other.first_seen_at)
    winner.last_seen_at = max(winner.last_seen_at, other.last_seen_at)
    return winner


def deduplicate(items: list[Opportunity]) -> list[Opportunity]:
    merged: list[Opportunity] = []
    for item in items:
        for index, existing in enumerate(merged):
            if is_duplicate(existing, item):
                merged[index] = merge(existing, item)
                break
        else:
            merged.append(item)
    return merged
