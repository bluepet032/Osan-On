from __future__ import annotations

from collections.abc import Iterable
from dataclasses import fields
from datetime import datetime

from pipeline.models import Opportunity


IMPORTANT_FIELDS = (
    "title",
    "organizer",
    "recruit_start",
    "recruit_end",
    "event_start",
    "event_end",
    "date_kind",
    "eligibility",
    "benefits",
    "location",
    "mode",
    "application_url",
    "document_url",
)


def identity_keys(item: Opportunity) -> set[str]:
    keys = {f"id:{item.id}"}
    keys.update(f"source:{source.source_url}" for source in item.sources)
    if item.application_url:
        keys.add(f"application:{item.application_url}")
    if item.dedupe_key:
        keys.add(f"dedupe:{item.dedupe_key}")
    return keys


def find_previous(items: Iterable[Opportunity], previous: list[Opportunity]) -> dict[int, Opportunity]:
    current_items = list(items)
    index: dict[str, Opportunity] = {}
    for item in previous:
        for key in identity_keys(item):
            index.setdefault(key, item)

    matches: dict[int, Opportunity] = {}
    claimed_previous: set[int] = set()

    # Preserve an exact stable ID before considering weaker source or dedupe keys.
    # This also makes the result independent of the current collection order.
    for item in current_items:
        match = index.get(f"id:{item.id}")
        if match and id(match) not in claimed_previous:
            matches[id(item)] = match
            claimed_previous.add(id(match))

    for item in current_items:
        if id(item) in matches:
            continue
        keys = sorted(identity_keys(item) - {f"id:{item.id}"})
        match = next(
            (index[key] for key in keys if key in index and id(index[key]) not in claimed_previous),
            None,
        )
        if match:
            matches[id(item)] = match
            claimed_previous.add(id(match))
    return matches


def reconcile_history(items: list[Opportunity], previous: list[Opportunity], now: datetime) -> list[Opportunity]:
    """Preserve stable history and mark only material changes.

    Items copied from a non-selected or failed source keep their old ``last_seen_at``.
    Freshly collected items already carry the current timestamp from normalization.
    """

    timestamp = now.isoformat(timespec="seconds")
    matches = find_previous(items, previous)
    for item in items:
        old = matches.get(id(item))
        if not old:
            continue
        item.id = old.id
        item.first_seen_at = old.first_seen_at
        changed = [name for name in IMPORTANT_FIELDS if getattr(item, name) != getattr(old, name)]
        if changed and item.last_seen_at == timestamp:
            item.last_changed_at = timestamp
            item.change_flags = changed
        else:
            item.last_changed_at = old.last_changed_at
            item.change_flags = old.change_flags
    return items


def clone_opportunity(data: dict) -> Opportunity | None:
    """Load a previous payload while ignoring fields from a future schema version."""

    allowed = {field.name for field in fields(Opportunity)}
    try:
        return Opportunity.from_dict({key: value for key, value in data.items() if key in allowed})
    except (KeyError, TypeError, ValueError):
        return None
