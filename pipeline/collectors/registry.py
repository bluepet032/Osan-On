from __future__ import annotations

from pipeline.collectors.base import Collector
from pipeline.collectors.bokjiro import BokjiroCollector
from pipeline.collectors.gov24 import Gov24Collector
from pipeline.config import SourceConfig
from pipeline.http import HttpClient


COLLECTORS: dict[str, type[Collector]] = {
    "bokjiro": BokjiroCollector,
    "gov24": Gov24Collector,
}


def create_collector(config: SourceConfig, client: HttpClient | None = None) -> Collector:
    """Pick the collector named in ``sources.yml``, else the one matching the source ID."""

    name = config.collector or config.id
    if name not in COLLECTORS:
        raise ValueError(f"알 수 없는 수집기: {name} (출처 {config.id})")
    return COLLECTORS[name](config, client)
