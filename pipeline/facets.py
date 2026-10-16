from __future__ import annotations

from pipeline.models import Opportunity


# Keys match the site's advanced filters (src/advancedFilters.ts).
FACET_KEYS = ("apply",)
APPLY_METHODS = ("online", "visit", "none")


def has_facet(item: Opportunity, key: str) -> bool:
    """Whether ``item`` states the fact behind one advanced filter."""

    if key == "apply":
        return bool(item.apply_methods)
    raise ValueError(f"unknown facet: {key}")


def facet_coverage(items: list[Opportunity]) -> dict[str, float] | None:
    """Share of ``items`` that carry each advanced-filter fact, or None without items."""

    if not items:
        return None
    return {key: round(sum(has_facet(item, key) for item in items) / len(items), 3) for key in FACET_KEYS}
