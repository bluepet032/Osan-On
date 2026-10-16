from datetime import datetime
from zoneinfo import ZoneInfo

from pipeline.dates import months_ago


KST = ZoneInfo("Asia/Seoul")


def test_months_ago_uses_calendar_month_boundary():
    assert months_ago(datetime(2026, 7, 30, tzinfo=KST), 3).isoformat() == "2026-04-30"
    assert months_ago(datetime(2026, 5, 31, tzinfo=KST), 3).isoformat() == "2026-02-28"
