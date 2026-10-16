from datetime import datetime

import pytest

from pipeline.collectors.dev_event import DevEventCollector
from pipeline.config import SourceConfig
from pipeline.http import Response


NOW = datetime(2026, 7, 30)


class FakeClient:
    def __init__(self, markdown):
        self.markdown = markdown

    def get(self, url, headers=None):
        return Response(url, 200, self.markdown, "text/plain")


def collect_item(format, metadata, heading="26년 08월"):
    cfg = SourceConfig("dev_event", "Dev-Event", "specialist", 60, "fast", "markdown", "https://example.com/list", "https://example.com", True)
    if format == "inline":
        markdown = f"## `{heading}`\n- __[게임 AI 행사](https://event.example.com)__ "
        markdown += " ".join(f"- {label}: `{value}`" for label, value in metadata)
    else:
        markdown = f"## `{heading}`\n* [게임 AI 행사](https://event.example.com)\n"
        markdown += "\n".join(f"  * {label}: `{value}`" for label, value in metadata)
    return DevEventCollector(cfg, FakeClient(markdown)).collect(NOW)[0]


@pytest.mark.parametrize("format", ["line", "inline"])
def test_event_only_does_not_become_recruitment(format):
    item = collect_item(format, [("일시", "2026. 08. 21 ~ 2026. 08. 22")])
    assert (item.recruit_start, item.recruit_end, item.date_kind) == (None, None, "unknown")
    assert (item.event_start, item.event_end) == ("2026-08-21", "2026-08-22")


@pytest.mark.parametrize("format", ["line", "inline"])
def test_recruitment_and_event_dates_keep_their_labels(format):
    item = collect_item(format, [
        ("분류", "온라인, 무료, AI"),
        ("주최", "테스트협회"),
        ("일시", "08. 21"),
        ("접수", "07. 20 ~ 08. 20"),
    ])
    assert (item.recruit_start, item.recruit_end, item.date_kind) == ("2026-07-20", "2026-08-20", "exact")
    assert (item.event_start, item.event_end) == ("2026-08-21", "2026-08-21")
    assert item.organizer == "테스트협회"
    assert "온라인, 무료, AI" in item.summary
    assert "07. 20 ~ 08. 20" in item.body_text


@pytest.mark.parametrize("format", ["line", "inline"])
@pytest.mark.parametrize("period,start,end", [
    ("2026. 07. 20 ~ 2026. 08. 20", "2026-07-20", "2026-08-20"),
    ("08월 20일", None, "2026-08-20"),
    ("12. 20 ~ 01. 10", "2026-12-20", "2027-01-10"),
    ("2025-12-20 ~ 01-10", "2025-12-20", "2026-01-10"),
    ("2026-12-20 ~ 2027-01-10", "2026-12-20", "2027-01-10"),
])
def test_recruitment_formats_and_year_rollover(format, period, start, end):
    item = collect_item(format, [("접수", period)])
    assert (item.recruit_start, item.recruit_end) == (start, end)
    assert item.date_kind == "exact"


@pytest.mark.parametrize("format", ["line", "inline"])
@pytest.mark.parametrize("period", [
    "02. 30",
    "13. 01",
    "2026-02-30 ~ 2026-03-01",
    "08. 20 ~ 08. 10",
    "2026-12-20 ~ 2026-01-10",
])
def test_invalid_recruitment_dates_are_unknown(format, period):
    item = collect_item(format, [("접수", period), ("일시", "08. 21")])
    assert (item.recruit_start, item.recruit_end, item.date_kind) == (None, None, "unknown")
    assert (item.event_start, item.event_end) == ("2026-08-21", "2026-08-21")


@pytest.mark.parametrize("format", ["line", "inline"])
def test_heading_year_is_used_for_short_dates(format):
    item = collect_item(format, [("일시", "02. 29")], heading="2028년 02월")
    assert (item.event_start, item.event_end) == ("2028-02-29", "2028-02-29")
    assert item.date_kind == "unknown"
