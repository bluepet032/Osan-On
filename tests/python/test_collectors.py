from pipeline.collectors.base import parse_date


def test_invalid_calendar_date_is_rejected():
    assert parse_date("2026-02-30") is None
