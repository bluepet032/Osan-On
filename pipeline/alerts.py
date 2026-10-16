from __future__ import annotations

import argparse
import json
from pathlib import Path

from pipeline.config import ROOT
from pipeline.storage import read_payload


# Collection runs once a day, so two failures in a row means about two days without data.
FAILURE_THRESHOLD = 2
# A successful run that returns less than half of the previous count usually means the
# page structure changed and the collector now finds only part of the list.
DROP_RATIO = 0.5
DROP_MIN_BASELINE = 10
# The advanced filters depend on facts collectors read from list and detail pages. When the
# share of items carrying one falls by half, a collector has usually stopped finding a field.
# Low baselines are too noisy to judge, so only facts most items used to carry are checked.
COVERAGE_DROP_RATIO = 0.5
COVERAGE_MIN_BASELINE = 0.2
FACET_LABELS = {"region": "지역", "mode": "진행 방식", "fee": "참가비", "audience": "참가 대상", "prize": "상금"}
FAILURE_PREFIX = "[수집 실패]"
DROP_PREFIX = "[수집 급감]"
COVERAGE_PREFIX = "[필터 정보 급감]"


def issue_title(source_id: str, prefix: str = FAILURE_PREFIX) -> str:
    return f"{prefix} {source_id}"


def _failure_body(item: dict, failures: int) -> str:
    return (
        f"출처 `{item.get('source_id')}`({item.get('source_name')})가 {failures}회 연속 실패했습니다.\n\n"
        f"- 마지막 성공: {item.get('last_success_at') or '없음'}\n"
        f"- 마지막 실행: {item.get('finished_at')}\n"
        f"- 오류: `{(item.get('error') or '').strip()[:300]}`\n\n"
        "대응 절차는 docs/OPERATIONS.md의 '상태 판정과 대응'을 따르세요. "
        "출처가 다시 성공하면 이 이슈는 자동으로 닫힙니다."
    )


def _drop_body(item: dict, baseline: int) -> str:
    return (
        f"출처 `{item.get('source_id')}`({item.get('source_name')})의 수집 건수가 "
        f"{baseline}건에서 {item.get('collected_count')}건으로 크게 줄었습니다.\n\n"
        f"- 실행 시각: {item.get('finished_at')}\n\n"
        "목록 페이지 구조가 바뀌어 일부만 읽히는지 확인하세요. "
        "수집 건수가 회복되면 이 이슈는 자동으로 닫힙니다."
    )


def _coverage_body(item: dict, drops: list[tuple[str, float, float]]) -> str:
    lines = "\n".join(f"- {FACET_LABELS.get(key, key)}: {before:.0%} → {after:.0%}" for key, before, after in drops)
    return (
        f"출처 `{item.get('source_id')}`({item.get('source_name')})에서 상세 필터 정보가 있는 공고 비율이 "
        f"크게 줄었습니다.\n\n{lines}\n\n- 실행 시각: {item.get('finished_at')}\n\n"
        "상세 페이지 구조나 필드 이름이 바뀌어 수집기가 값을 읽지 못하는지 확인하세요. "
        "비율이 회복되면 이 이슈는 자동으로 닫힙니다."
    )


def coverage_drops(
    item: dict, ratio: float = COVERAGE_DROP_RATIO, min_baseline: float = COVERAGE_MIN_BASELINE,
    min_items: int = DROP_MIN_BASELINE,
) -> list[tuple[str, float, float]] | None:
    """Facts whose coverage fell below ``ratio`` of the previous successful run.

    Returns None when the run cannot be judged (no coverage recorded or too few items).
    """

    current = item.get("facet_coverage")
    if item.get("status") != "success" or not isinstance(current, dict):
        return None
    if int(item.get("collected_count") or 0) < min_items:
        return None
    baseline = item.get("previous_facet_coverage") or {}
    drops: list[tuple[str, float, float]] = []
    for key, before in baseline.items():
        after = float(current.get(key) or 0)
        if before >= min_baseline and after < before * ratio:
            drops.append((key, float(before), after))
    return drops


def is_drop(item: dict, ratio: float = DROP_RATIO, min_baseline: int = DROP_MIN_BASELINE) -> bool:
    baseline = item.get("previous_collected_count")
    if item.get("status") != "success" or not baseline or baseline < min_baseline:
        return False
    return int(item.get("collected_count") or 0) < baseline * ratio


def source_alerts(payload: dict, threshold: int = FAILURE_THRESHOLD, check_drops: bool = True) -> dict[str, list[dict]]:
    """Split sources into issues to open and issues that can be closed.

    ``check_drops`` should be off for manual runs with a lower ``--limit`` or a single
    source, where a smaller count is expected rather than a sign of breakage.
    """

    failing: list[dict] = []
    recovered: list[dict] = []
    for item in payload.get("items", []):
        source_id = item.get("source_id", "")
        failures = int(item.get("consecutive_failures") or 0)
        failure_issue = {"source_id": source_id, "title": issue_title(source_id, FAILURE_PREFIX)}
        if failures >= threshold:
            failing.append({**failure_issue, "body": _failure_body(item, failures)})
        elif item.get("status") == "success":
            recovered.append(failure_issue)

        if not check_drops or item.get("status") != "success":
            continue
        drop_issue = {"source_id": source_id, "title": issue_title(source_id, DROP_PREFIX)}
        if is_drop(item):
            failing.append({**drop_issue, "body": _drop_body(item, int(item["previous_collected_count"]))})
        else:
            recovered.append(drop_issue)

        drops = coverage_drops(item)
        if drops is None:
            continue
        coverage_issue = {"source_id": source_id, "title": issue_title(source_id, COVERAGE_PREFIX)}
        if drops:
            failing.append({**coverage_issue, "body": _coverage_body(item, drops)})
        else:
            recovered.append(coverage_issue)
    return {"failing": failing, "recovered": recovered}


def main() -> None:
    parser = argparse.ArgumentParser(description="연속 실패·수집 급감·필터 정보 급감 출처를 GitHub 이슈용 JSON으로 출력")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "public" / "data")
    parser.add_argument("--threshold", type=int, default=FAILURE_THRESHOLD)
    parser.add_argument("--skip-drops", action="store_true", help="수동 부분 실행처럼 건수 감소가 정상인 경우")
    args = parser.parse_args()
    alerts = source_alerts(read_payload(args.data_dir / "sources.json"), args.threshold, not args.skip_drops)
    print(json.dumps(alerts, ensure_ascii=False))


if __name__ == "__main__":
    main()
