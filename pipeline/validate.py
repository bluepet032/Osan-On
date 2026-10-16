from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

from pipeline import SCHEMA_VERSION
from pipeline.config import ROOT
from pipeline.facets import FACET_KEYS
from pipeline.models import Opportunity
from pipeline.storage import read_payload


OPPORTUNITY_FILES = ("active.json", "undated.json", "closed.json", "review.json")
VALID_TYPES = {"contest", "support", "hackathon", "event", "education", "supporters", "employment", "other"}
VALID_STATUSES = {"upcoming", "open", "urgent", "today", "closed", "ongoing", "unknown"}
VALID_DATE_KINDS = {"exact", "ongoing", "first_come", "budget", "unknown", "inquiry"}
VALID_DOMAINS = {"it", "design_media", "literature_arts", "planning_ideas", "business"}
# Source bodies are used only during classification and must never be republished.
FORBIDDEN_ITEM_KEYS = ("classification_inputs", "body_text")


def valid_http_url(value: str | None) -> bool:
    if not value:
        return True
    parts = urlsplit(value)
    return parts.scheme in {"http", "https"} and bool(parts.netloc)


def valid_coverage(value: object) -> bool:
    if value is None:
        return True
    return isinstance(value, dict) and all(
        key in FACET_KEYS and isinstance(share, (int, float)) and not isinstance(share, bool) and 0 <= share <= 1
        for key, share in value.items()
    )


def validate_payloads(data_dir: Path) -> list[str]:
    errors: list[str] = []
    seen_ids: set[str] = set()
    for filename in (*OPPORTUNITY_FILES, "sources.json"):
        path = data_dir / filename
        if not path.exists():
            errors.append(f"{filename}: 파일이 없습니다")
            continue
        try:
            payload = read_payload(path)
        except (OSError, ValueError) as error:
            errors.append(f"{filename}: JSON을 읽을 수 없습니다 ({error})")
            continue
        if payload.get("schema_version") != SCHEMA_VERSION:
            errors.append(f"{filename}: schema_version이 {SCHEMA_VERSION}이 아닙니다")
        try:
            datetime.fromisoformat(payload["generated_at"])
        except (KeyError, TypeError, ValueError):
            errors.append(f"{filename}: generated_at이 올바르지 않습니다")
        if not isinstance(payload.get("items"), list):
            errors.append(f"{filename}: items가 배열이 아닙니다")
            continue
        if filename == "sources.json":
            for index, item in enumerate(payload["items"]):
                if not item.get("source_id") or item.get("status") not in {"success", "failed", "skipped"}:
                    errors.append(f"{filename}[{index}]: 출처 상태 필드가 올바르지 않습니다")
                for key in ("facet_coverage", "previous_facet_coverage"):
                    if not valid_coverage(item.get(key)):
                        errors.append(f"{filename}[{index}]: {key}는 필터별 0~1 비율이어야 합니다")
            continue
        for index, data in enumerate(payload["items"]):
            leaked = [key for key in FORBIDDEN_ITEM_KEYS if key in data]
            if leaked:
                errors.append(f"{filename}[{index}]: 원문 본문 필드는 공개 데이터에 포함할 수 없습니다 ({', '.join(leaked)})")
                data = {key: value for key, value in data.items() if key not in leaked}
            try:
                item = Opportunity.from_dict(data)
            except (KeyError, TypeError, ValueError) as error:
                errors.append(f"{filename}[{index}]: 공통 스키마 변환 실패 ({error})")
                continue
            if item.id in seen_ids:
                errors.append(f"{filename}[{index}]: 중복 id {item.id}")
            seen_ids.add(item.id)
            if not item.title.strip() or not item.source_url or not valid_http_url(item.source_url):
                errors.append(f"{filename}[{index}]: 제목 또는 대표 URL이 올바르지 않습니다")
            if not 60 <= len(item.summary) <= 180:
                errors.append(f"{filename}[{index}]: 요약은 60~180자여야 합니다")
            if item.primary_type not in VALID_TYPES or item.status not in VALID_STATUSES or item.date_kind not in VALID_DATE_KINDS:
                errors.append(f"{filename}[{index}]: 유형, 상태 또는 날짜 유형이 올바르지 않습니다")
            if not item.sources:
                errors.append(f"{filename}[{index}]: 발견 출처가 없습니다")
            for source_index, source in enumerate(item.sources):
                if not source.source_id or not source.source_name or not source.source_url or not valid_http_url(source.source_url):
                    errors.append(f"{filename}[{index}].sources[{source_index}]: 출처 필드가 올바르지 않습니다")
            for field_name in ("first_seen_at", "last_seen_at", "last_changed_at"):
                value = getattr(item, field_name)
                if not value:
                    if field_name == "last_changed_at":
                        continue
                    errors.append(f"{filename}[{index}]: {field_name}이 없습니다")
                    continue
                try:
                    datetime.fromisoformat(value)
                except ValueError:
                    errors.append(f"{filename}[{index}]: {field_name}이 올바르지 않습니다")
            for field_name in ("application_url", "document_url"):
                if not valid_http_url(getattr(item, field_name)):
                    errors.append(f"{filename}[{index}]: {field_name}이 안전한 HTTP(S) URL이 아닙니다")
            if item.domain not in VALID_DOMAINS:
                errors.append(f"{filename}[{index}]: 분야(domain)가 올바르지 않습니다")
            # The 70-point threshold is the IT·게임 relevance score; other field tabs publish by topic match.
            if item.relevance.decision == "publish" and item.domain == "it" and item.relevance.score < 70:
                errors.append(f"{filename}[{index}]: 공개 점수가 70점 미만입니다")
            if item.relevance.decision == "review" and not 50 <= item.relevance.score < 70:
                errors.append(f"{filename}[{index}]: 검토 점수가 50~69점 범위가 아닙니다")
    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description="QuestBoard 생성 JSON 검증")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "public" / "data")
    args = parser.parse_args()
    errors = validate_payloads(args.data_dir)
    if errors:
        raise SystemExit("\n".join(f"- {error}" for error in errors))
    print(f"QuestBoard 데이터 검증 완료: {args.data_dir}")


if __name__ == "__main__":
    main()
