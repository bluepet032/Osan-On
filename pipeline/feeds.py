from __future__ import annotations

from datetime import datetime
from email.utils import format_datetime
from pathlib import Path
from xml.etree import ElementTree

from pipeline.models import Opportunity


SITE_URL = "https://bluepet032.github.io/QuestBoard/"
FEED_SIZE = 50
# Same tabs as DOMAIN_LABELS in src/constants.ts.
DOMAIN_LABELS = {
    "it": "IT·게임", "design_media": "디자인·영상", "literature_arts": "문학·예술",
    "planning_ideas": "기획·아이디어", "business": "창업·비즈니스",
}


def feed_xml(items: list[Opportunity], label: str, now: datetime) -> bytes:
    """RSS 2.0 of the newest notices, each linking to its page on the site."""

    rss = ElementTree.Element("rss", version="2.0")
    channel = ElementTree.SubElement(rss, "channel")
    for tag, text in (
        ("title", f"QuestBoard — {label}"), ("link", SITE_URL),
        ("description", f"{label} 분야의 새 공모전·지원사업·행사"), ("language", "ko"),
        ("lastBuildDate", format_datetime(now)),
    ):
        ElementTree.SubElement(channel, tag).text = text
    for item in sorted(items, key=lambda value: value.first_seen_at, reverse=True)[:FEED_SIZE]:
        entry = ElementTree.SubElement(channel, "item")
        ElementTree.SubElement(entry, "title").text = item.title
        ElementTree.SubElement(entry, "link").text = f"{SITE_URL}#/notice/{item.id}"
        ElementTree.SubElement(entry, "guid", isPermaLink="false").text = item.id
        ElementTree.SubElement(entry, "pubDate").text = format_datetime(datetime.fromisoformat(item.first_seen_at))
        ElementTree.SubElement(entry, "description").text = f"{item.organizer} · 마감 {item.recruit_end or '미정'} — {item.summary}"
    return ElementTree.tostring(rss, encoding="utf-8", xml_declaration=True)


def write_feeds(output_dir: Path, items: list[Opportunity], now: datetime) -> None:
    """One feed for all fields and one per field tab, matching the site's default list."""

    visible = [item for item in items if not item.is_adjacent]
    feeds = {"feed.xml": (visible, "전체 분야")}
    feeds.update({f"feed-{domain}.xml": ([item for item in visible if item.domain == domain], label) for domain, label in DOMAIN_LABELS.items()})
    for filename, (selected, label) in feeds.items():
        path = output_dir / filename
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_bytes(feed_xml(selected, label, now))
        temporary.replace(path)
