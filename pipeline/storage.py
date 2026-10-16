from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from pipeline import SCHEMA_VERSION
from pipeline.dates import months_ago, parse_iso_date
from pipeline.feeds import write_feeds
from pipeline.models import CrawlStatus, Opportunity


def read_payload(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_payload(path: Path, items: list[dict], now: datetime, **extra: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": now.isoformat(timespec="seconds"),
        "items": items,
        **extra,
    }
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temporary.replace(path)


def partition(items: list[Opportunity], now: datetime) -> tuple[list[Opportunity], list[Opportunity], list[Opportunity], list[Opportunity]]:
    active: list[Opportunity] = []
    undated: list[Opportunity] = []
    closed: list[Opportunity] = []
    review: list[Opportunity] = []
    cutoff = months_ago(now, 3)
    for item in items:
        if item.relevance.decision == "review":
            review.append(item)
            continue
        if item.relevance.decision != "publish":
            continue
        if item.status == "closed":
            end = parse_iso_date(item.recruit_end)
            if end and end >= cutoff:
                closed.append(item)
        elif item.status == "unknown":
            undated.append(item)
        else:
            active.append(item)
    return active, undated, closed, review


def write_all(output_dir: Path, items: list[Opportunity], statuses: list[CrawlStatus], now: datetime) -> None:
    active, undated, closed, review = partition(items, now)
    sort_key = lambda item: (item.d_day if item.d_day is not None else 99999, item.title)
    write_payload(output_dir / "active.json", [item.to_dict() for item in sorted(active, key=sort_key)], now)
    write_payload(output_dir / "undated.json", [item.to_dict() for item in undated], now)
    write_payload(output_dir / "closed.json", [item.to_dict() for item in sorted(closed, key=sort_key, reverse=True)], now)
    write_payload(output_dir / "review.json", [item.to_dict() for item in sorted(review, key=lambda item: -item.relevance.score)], now)
    write_payload(output_dir / "sources.json", [status.to_dict() for status in statuses], now)
    write_feeds(output_dir, active + undated, now)
