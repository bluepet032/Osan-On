import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from pipeline.models import CrawlStatus, RawOpportunity
from pipeline.normalize import normalize
from pipeline.storage import write_all
from pipeline.validate import validate_payloads


NOW = datetime(2026, 10, 16, 9, tzinfo=ZoneInfo("Asia/Seoul"))


def sample_data(tmp_path: Path) -> Path:
    """Public data with two benefits and three source statuses, written by the real storage code."""

    data_dir = tmp_path / "data"
    items = [normalize(RawOpportunity(
        source_id="gov24", source_name="정부24", source_url=f"https://www.gov.kr/portal/rcvfvrSvc/dtlEx/{key}",
        title=f"오산시 청년 지원 {key}", summary="청년의 생활 안정을 위해 매달 지원금을 드립니다", date_kind="ongoing",
        jurisdiction="osan", conditions={"codes": ["JA0102"], "age_min": 19, "age_max": 34}, category="생활안정", support_type="현금",
    ), NOW) for key in ("A1", "A2")]
    stamp = NOW.isoformat(timespec="seconds")
    statuses = [CrawlStatus(source_id=f"s{index}", source_name=f"출처{index}", status="success", started_at=stamp, finished_at=stamp) for index in range(3)]
    write_all(data_dir, items, statuses, NOW)
    return data_dir


def test_committed_generated_data_is_valid():
    assert validate_payloads(Path("public/data")) == []


def test_sample_benefit_data_is_valid(tmp_path: Path):
    assert validate_payloads(sample_data(tmp_path)) == []


def test_unknown_jurisdiction_and_bad_conditions_are_rejected(tmp_path: Path):
    data_dir = sample_data(tmp_path)
    path = data_dir / "active.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["items"][0]["jurisdiction"] = "seoul"
    payload["items"][1]["conditions"] = {"codes": "JA0102", "age_min": "19", "age_max": None}
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    errors = validate_payloads(data_dir)

    assert any("[0]: 소관(jurisdiction)" in error for error in errors)
    assert any("[1]: 지원조건(conditions)" in error for error in errors)


def test_invalid_public_summary_and_source_url_are_rejected(tmp_path: Path):
    data_dir = sample_data(tmp_path)
    path = data_dir / "active.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["items"][0]["summary"] = "너무 짧음"
    payload["items"][0]["source_url"] = ""
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    errors = validate_payloads(data_dir)

    assert any("요약은 60~180자" in error for error in errors)
    assert any("대표 URL" in error for error in errors)


def test_source_body_text_in_public_data_is_rejected(tmp_path: Path):
    data_dir = sample_data(tmp_path)
    path = data_dir / "active.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["items"][0]["classification_inputs"] = [{"body_text": "원문 본문 전체"}]
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    errors = validate_payloads(data_dir)

    assert any("원문 본문 필드" in error for error in errors)


def test_items_need_a_known_domain(tmp_path: Path):
    data_dir = sample_data(tmp_path)
    path = data_dir / "active.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["items"][0]["domain"] = "housing"
    payload["items"][1]["domain"] = "cooking"
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    errors = validate_payloads(data_dir)

    assert not any("[0]: 분야(domain)" in error for error in errors)
    assert any("[1]: 분야(domain)" in error for error in errors)


def test_source_facet_coverage_must_be_known_shares(tmp_path: Path):
    data_dir = sample_data(tmp_path)
    path = data_dir / "sources.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["items"][0]["facet_coverage"] = {"apply": 0.5}
    payload["items"][1]["facet_coverage"] = {"apply": 1.5}
    payload["items"][2]["previous_facet_coverage"] = {"weather": 0.5}
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    errors = [error for error in validate_payloads(data_dir) if "coverage" in error]

    assert errors == [
        "sources.json[1]: facet_coverage는 필터별 0~1 비율이어야 합니다",
        "sources.json[2]: previous_facet_coverage는 필터별 0~1 비율이어야 합니다",
    ]
