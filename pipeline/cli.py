from __future__ import annotations

import argparse
from pathlib import Path

from pipeline.config import ROOT
from pipeline.runner import run_pipeline


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description="QuestBoard data pipeline")
    value.add_argument("--schedule", choices=["fast", "slow", "all"], default="all")
    value.add_argument("--source", action="append", dest="sources", help="실행할 출처 ID (반복 가능)")
    value.add_argument("--limit", type=int, help="모든 출처의 최대 수집 개수(생략하면 sources.yml의 limit, 없으면 150)")
    value.add_argument("--output", type=Path, default=ROOT / "public" / "data")
    return value


def main() -> None:
    args = parser().parse_args()
    items, statuses = run_pipeline(args.output, args.schedule, set(args.sources or []), args.limit)
    success = sum(status.status == "success" for status in statuses)
    failed = sum(status.status == "failed" for status in statuses)
    print(f"QuestBoard: {len(items)}개 정규화, 출처 성공 {success}, 실패 {failed}")


if __name__ == "__main__":
    main()
