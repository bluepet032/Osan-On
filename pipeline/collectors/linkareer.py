from __future__ import annotations

import json
import re
from datetime import datetime

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.collectors.html import with_query
from pipeline.http import FetchError, RobotsDisallowed
from pipeline.models import RawOpportunity


NEXT_DATA_RE = re.compile(r'<script\s+id=["\']__NEXT_DATA__["\'][^>]*>(?P<data>.*?)</script>', re.I | re.S)


def _apollo_state(markup: str) -> dict:
    match = NEXT_DATA_RE.search(markup)
    if not match:
        return {}
    try:
        props = json.loads(match.group("data"))["props"]
        state = props.get("pageProps", {}).get("__APOLLO_STATE__") or props.get("apolloState")
    except (json.JSONDecodeError, KeyError, TypeError, AttributeError):
        return {}
    return state if isinstance(state, dict) else {}


def _ms_to_date(value, now: datetime) -> str | None:
    return datetime.fromtimestamp(value / 1000, tz=now.tzinfo).date().isoformat() if isinstance(value, (int, float)) else None


class LinkareerCollector(Collector):
    """Read Linkareer's public server-rendered Apollo state.

    The list gives title, organizer and deadline. Each item's public detail page adds the
    target audience, prize money, categories and start date. Only those named fields are
    read; contact details on the page (manager name, e-mail, phone) are never touched.
    A failed detail page keeps the list data instead of failing the source.
    """

    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        results: list[RawOpportunity] = []
        seen: set[str] = set()
        max_pages = max(2, (limit + 19) // 20 + 1)
        for page in range(1, max_pages + 1):
            response = self.client.get(with_query(self.config.list_url, page=page))
            page_items = self._parse_page(response.text, now)
            new_items = [item for item in page_items if item.source_post_id not in seen]
            if not new_items:
                break
            for item in new_items:
                seen.add(item.source_post_id or item.source_url)
                results.append(item)
            if len(results) >= limit:
                break
        if not results:
            raise CollectorStructureError("링커리어 공개 목록 상태에서 공모전 항목을 찾지 못했습니다")
        results = results[:limit]
        for item in results:
            self._add_details(item, now)
        return results

    def _add_details(self, item: RawOpportunity, now: datetime) -> None:
        try:
            response = self.client.get(item.source_url)
        except RobotsDisallowed:
            raise
        except FetchError:
            return
        state = _apollo_state(response.text)
        activity = state.get(f"Activity:{item.source_post_id}")
        if not isinstance(activity, dict):
            return

        def names(key: str) -> list[str]:
            refs = activity.get(key) or []
            values = [state.get(ref.get("__ref"), {}).get("name") for ref in refs if isinstance(ref, dict)]
            return [str(value).strip() for value in values if value]

        targets = names("targets")
        if targets:
            item.eligibility = ", ".join(targets)
        categories = names("categories")
        if categories:
            item.original_category = ", ".join(categories)
            item.body_text = f"{item.title} {item.original_category}"
        regions = names("regions")
        if regions:
            item.location = ", ".join(regions)
        reward = activity.get("tenThousandUnitOfReward")
        if isinstance(reward, (int, float)) and reward > 0:
            item.benefits = f"상금 {int(reward)}만원"
        start = _ms_to_date(activity.get("recruitStartAt"), now)
        if start and (not item.recruit_end or start <= item.recruit_end):
            item.recruit_start = start

    def _parse_page(self, markup: str, now: datetime) -> list[RawOpportunity]:
        state = _apollo_state(markup)
        results: list[RawOpportunity] = []
        for key, value in state.items():
            if not key.startswith("Activity:") or not isinstance(value, dict) or not value.get("title"):
                continue
            post_id = str(value.get("id") or key.partition(":")[2])
            end = _ms_to_date(value.get("recruitCloseAt"), now)
            results.append(RawOpportunity(
                source_id=self.config.id,
                source_name=self.config.name,
                source_url=f"https://linkareer.com/activity/{post_id}",
                source_post_id=post_id,
                title=str(value["title"]),
                organizer=str(value.get("organizationName") or self.config.name),
                summary="링커리어 공개 공모전 목록",
                body_text=str(value["title"]),
                source_kind=self.config.kind,
                source_priority=self.config.priority,
                recruit_end=end,
                date_kind="exact" if end else "unknown",
                collected_at=now.isoformat(timespec="seconds"),
            ))
        return results
