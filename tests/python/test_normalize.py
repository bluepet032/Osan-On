from datetime import datetime
from zoneinfo import ZoneInfo

from pipeline.config import load_taxonomy
from pipeline.models import RawOpportunity
from pipeline.normalize import normalize


def test_generated_summary_respects_public_length_contract():
    now = datetime(2026, 7, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    item = normalize(RawOpportunity(
        source_id="test",
        source_name="테스트",
        source_url="https://example.com/short",
        title="AI 게임 해커톤",
        summary="짧은 안내",
    ), load_taxonomy(), now)

    assert 60 <= len(item.summary) <= 180


def test_normalized_item_does_not_carry_source_body_text():
    now = datetime(2026, 7, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    item = normalize(RawOpportunity(
        source_id="test",
        source_name="테스트",
        source_url="https://example.com/body",
        title="AI 게임 해커톤",
        body_text="원문 상세 본문 " * 100,
    ), load_taxonomy(), now)

    assert "원문 상세 본문" not in str(item.to_dict())
