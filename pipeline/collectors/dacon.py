from __future__ import annotations

import json
import re
from datetime import datetime
from urllib.parse import urljoin

from pipeline.collectors.base import Collector, CollectorStructureError
from pipeline.collectors.html import clean_text, parse_date
from pipeline.models import RawOpportunity


NUXT_RE = re.compile(r"window\.__NUXT__=\(function\((?P<params>[^)]*)\)\{return ")
FIELD_RE = re.compile(r'(?P<key>[A-Za-z_]\w*):(?P<value>"(?:[^"\\]|\\.)*"|[^,{}\[\]]+)')
LITERALS = {"true": True, "false": False, "null": None, "void 0": None}


def _skip_string(text: str, index: int) -> int:
    """Return the index just past the JS string literal that starts at ``index``."""

    index += 1
    while index < len(text):
        if text[index] == "\\":
            index += 2
            continue
        if text[index] == '"':
            return index + 1
        index += 1
    raise CollectorStructureError("DACON 공개 데이터의 문자열이 닫히지 않았습니다")


def _balanced_end(text: str, start: int) -> int:
    """Return the index just past the bracket group opening at ``start``."""

    pairs = {"{": "}", "[": "]", "(": ")"}
    stack = [pairs[text[start]]]
    index = start + 1
    while stack:
        if index >= len(text):
            raise CollectorStructureError("DACON 공개 데이터 괄호 구조가 올바르지 않습니다")
        char = text[index]
        if char == '"':
            index = _skip_string(text, index)
            continue
        if char in pairs:
            stack.append(pairs[char])
        elif char == stack[-1]:
            stack.pop()
        index += 1
    return index


def _split_args(text: str) -> list[str]:
    """Split a JS argument list on top-level commas."""

    parts: list[str] = []
    depth, start, index = 0, 0, 0
    while index < len(text):
        char = text[index]
        if char == '"':
            index = _skip_string(text, index)
            continue
        if char in "{[(":
            depth += 1
        elif char in "}])":
            depth -= 1
        elif char == "," and depth == 0:
            parts.append(text[start:index].strip())
            start = index + 1
        index += 1
    if text[start:].strip():
        parts.append(text[start:].strip())
    return parts


def _literal(token: str):
    token = token.strip()
    if token in LITERALS:
        return LITERALS[token]
    try:
        return json.loads(token)
    except json.JSONDecodeError:
        # Nested objects or arrays are not needed for competition records.
        return None


def parse_nuxt_competitions(markup: str) -> list[dict]:
    """Read competition records from the Nuxt state the server embeds in the page.

    Nuxt stores repeated values as parameters of a wrapping function, so a record may say
    ``period_end:l`` and the real value is the matching argument at the end of the script.
    Only literal values are resolved; no script is executed.
    """

    match = NUXT_RE.search(markup)
    if not match:
        raise CollectorStructureError("DACON 목록에서 공개 Nuxt 데이터를 찾지 못했습니다")
    params = [name.strip() for name in match["params"].split(",") if name.strip()]
    body_start = match.end()
    body_end = _balanced_end(markup, body_start)
    if markup[body_end:body_end + 2] != "}(":
        raise CollectorStructureError("DACON 공개 데이터 함수 형식이 바뀌었습니다")
    args_start = body_end + 1
    args = _split_args(markup[args_start + 1:_balanced_end(markup, args_start) - 1])
    variables = {name: _literal(value) for name, value in zip(params, args)}

    body = markup[body_start:body_end]
    list_start = body.find("compData:[")
    if list_start < 0:
        raise CollectorStructureError("DACON 공개 데이터에 대회 목록(compData)이 없습니다")
    list_start += len("compData:")
    list_body = body[list_start + 1:_balanced_end(body, list_start) - 1]

    records: list[dict] = []
    index = 0
    while (start := list_body.find("{", index)) >= 0:
        end = _balanced_end(list_body, start)
        record = {}
        for field in FIELD_RE.finditer(list_body[start + 1:end - 1]):
            value = field["value"].strip()
            record[field["key"]] = variables[value] if value in variables else _literal(value)
        records.append(record)
        index = end
    return records


class DaconCollector(Collector):
    """Collect DACON competitions from the public list page's embedded server state."""

    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        response = self.client.get(self.config.list_url)
        records = [record for record in parse_nuxt_competitions(response.text) if record.get("cpt_id") and record.get("name")]
        if not records:
            raise CollectorStructureError("DACON 공개 데이터에서 대회를 찾지 못했습니다")
        results: list[RawOpportunity] = []
        for record in records[:limit]:
            title = clean_text(str(record["name"]))
            keyword = clean_text(str(record.get("keyword") or ""))
            prize = clean_text(str(record.get("prize_info") or "")).strip("- ")
            sponsor = clean_text(str(record.get("sponsor") or ""))
            summary = " · ".join(part for part in (f"DACON AI 경진대회: {keyword}" if keyword else "DACON AI 경진대회", f"상금 {prize}" if prize else "") if part)
            end = parse_date(str(record.get("period_end") or ""))
            results.append(RawOpportunity(
                source_id=self.config.id,
                source_name=self.config.name,
                source_url=urljoin(self.config.homepage, f"/competitions/official/{record['cpt_id']}/overview/description"),
                source_post_id=str(record["cpt_id"]),
                title=title,
                organizer=sponsor or self.config.name,
                summary=summary,
                body_text=f"{title} {keyword} 경진대회",
                source_kind=self.config.kind,
                source_priority=self.config.priority,
                recruit_start=parse_date(str(record.get("period_start") or "")),
                recruit_end=end,
                date_kind="exact" if end else "unknown",
                benefits=f"상금 {prize}" if prize else "",
                mode="online",
                collected_at=now.isoformat(timespec="seconds"),
            ))
        return results
