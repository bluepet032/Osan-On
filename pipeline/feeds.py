from __future__ import annotations

from datetime import datetime
from email.utils import format_datetime
from pathlib import Path
from xml.etree import ElementTree

from pipeline.models import Opportunity


SITE_URL = "https://bluepet032.github.io/Osan-On/"
FEED_SIZE = 50
# Same tabs as DOMAIN_LABELS in src/constants.ts.
DOMAIN_LABELS = {
    "living": "생활안정", "housing": "주거·자립", "childcare": "보육·교육", "jobs": "고용·창업", "health": "보건·의료",
    "admin": "행정·안전", "pregnancy": "임신·출산", "care": "보호·돌봄", "culture": "문화·환경", "agriculture": "농림축산어업",
}


def feed_xml(items: list[Opportunity], label: str, now: datetime) -> bytes:
    """RSS 2.0 of the newest notices, each linking to its page on the site."""

    rss = ElementTree.Element("rss", version="2.0")
    channel = ElementTree.SubElement(rss, "channel")
    for tag, text in (
        ("title", f"오산온 — {label}"), ("link", SITE_URL),
        ("description", f"{label} 분야의 새 정부·지자체 혜택"), ("language", "ko"),
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

    feeds = {"feed.xml": (items, "전체 분야")}
    feeds.update({f"feed-{domain}.xml": ([item for item in items if item.domain == domain], label) for domain, label in DOMAIN_LABELS.items()})
    for filename, (selected, label) in feeds.items():
        path = output_dir / filename
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_bytes(feed_xml(selected, label, now))
        temporary.replace(path)
