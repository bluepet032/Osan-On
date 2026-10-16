from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

from pipeline.config import load_taxonomy
from pipeline.models import RawOpportunity
from pipeline.normalize import normalize
from pipeline.storage import write_all


KST = ZoneInfo("Asia/Seoul")
NOW = datetime(2026, 10, 15, 7, tzinfo=KST)


def notice(key: str, *, domain: str = "it", decision: str = "publish", end: str | None = "2026-11-30",
           first_seen: str = "2026-10-10T07:00:00+09:00", adjacent: bool = False):
    item = normalize(RawOpportunity(
        source_id="test", source_name="테스트", source_url=f"https://example.com/{key}",
        title=f"게임 공모전 {key} <특별> & 상금", recruit_end=end, date_kind="exact" if end else "unknown",
    ), load_taxonomy(), NOW)
    item.domain, item.is_adjacent, item.first_seen_at = domain, adjacent, first_seen
    item.relevance.decision = decision
    return item


def entries(path: Path) -> list[ElementTree.Element]:
    return ElementTree.parse(path).getroot().findall("./channel/item")


def test_feeds_list_new_public_notices_per_field(tmp_path: Path):
    items = [
        notice("older", first_seen="2026-10-01T07:00:00+09:00"),
        notice("newer", first_seen="2026-10-14T07:00:00+09:00"),
        notice("design", domain="design_media", end=None),
        notice("closed", end="2026-10-01"),
        notice("review", decision="review"),
        notice("job", adjacent=True),
    ]
    write_all(tmp_path, items, [], NOW)

    titles = [entry.findtext("title") for entry in entries(tmp_path / "feed.xml")]
    assert titles == ["게임 공모전 newer <특별> & 상금", "게임 공모전 design <특별> & 상금", "게임 공모전 older <특별> & 상금"]
    assert [entry.findtext("title") for entry in entries(tmp_path / "feed-design_media.xml")] == ["게임 공모전 design <특별> & 상금"]
    assert entries(tmp_path / "feed-business.xml") == []

    newest = entries(tmp_path / "feed.xml")[0]
    assert newest.findtext("link") == f"https://bluepet032.github.io/QuestBoard/#/notice/{items[1].id}"
    assert newest.findtext("pubDate") == "Wed, 14 Oct 2026 07:00:00 +0900"
