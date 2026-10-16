from __future__ import annotations

import re
from abc import ABC, abstractmethod
from datetime import date, datetime
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from pipeline.config import SourceConfig
from pipeline.http import HttpClient
from pipeline.models import RawOpportunity


DATE_RE = re.compile(r"(?P<year>20\d{2})[.\-/년\s]+(?P<month>\d{1,2})[.\-/월\s]+(?P<day>\d{1,2})")


class CollectorStructureError(RuntimeError):
    pass


class Collector(ABC):
    def __init__(self, config: SourceConfig, client: HttpClient | None = None):
        self.config = config
        self.client = client or HttpClient()

    @abstractmethod
    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        raise NotImplementedError


def with_query(url: str, **params: str | int) -> str:
    """Return ``url`` with the given query parameters set, keeping the others."""

    parts = urlsplit(url)
    query = {key: values[-1] for key, values in parse_qs(parts.query).items()}
    query.update({key: str(value) for key, value in params.items()})
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def parse_date(value: str) -> str | None:
    match = DATE_RE.search(value or "")
    if not match:
        return None
    try:
        parsed = date(int(match["year"]), int(match["month"]), int(match["day"]))
        return parsed.isoformat()
    except ValueError:
        return None


def dates_from_text(value: str) -> tuple[str | None, str | None]:
    matches = list(DATE_RE.finditer(value or ""))
    dates = [parse_date(match.group(0)) for match in matches[:4]]
    dates = [item for item in dates if item]
    if not dates:
        return None, None
    if len(dates) == 1:
        return None, dates[0]
    return dates[0], dates[1]
