from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from pipeline.models import DateKind, OpportunityStatus


KST = ZoneInfo("Asia/Seoul")


def months_ago(value: datetime, months: int) -> date:
    current = value.astimezone(KST).date()
    month_index = current.year * 12 + current.month - 1 - months
    year, zero_based_month = divmod(month_index, 12)
    month = zero_based_month + 1
    return date(year, month, min(current.day, monthrange(year, month)[1]))


def parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def status_for(
    start: str | None,
    end: str | None,
    date_kind: DateKind,
    now: datetime,
) -> tuple[OpportunityStatus, int | None]:
    today = now.astimezone(KST).date()
    start_date = parse_iso_date(start)
    end_date = parse_iso_date(end)
    if date_kind == "ongoing":
        return "ongoing", None
    if not end_date:
        return "unknown", None
    d_day = (end_date - today).days
    # A passed deadline wins over a later start date, which only a misread page can produce.
    if d_day < 0:
        return "closed", d_day
    if start_date and today < start_date:
        return "upcoming", d_day
    if d_day == 0:
        return "today", 0
    if d_day <= 3:
        return "urgent", d_day
    return "open", d_day


def end_of_day(value: str | None) -> datetime | None:
    parsed = parse_iso_date(value)
    return datetime.combine(parsed, time.max, KST) if parsed else None
