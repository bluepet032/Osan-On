from __future__ import annotations

from pipeline.collectors.base import Collector
from pipeline.collectors.gov24 import Gov24Collector
from pipeline.collectors.html import StructuredHtmlCollector
from pipeline.config import SourceConfig
from pipeline.http import HttpClient


DEFAULT_COLLECTOR = "html"
COLLECTORS: dict[str, type[Collector]] = {
    "gov24": Gov24Collector,
    "html": StructuredHtmlCollector,
}


def create_collector(config: SourceConfig, client: HttpClient | None = None) -> Collector:
    """Pick the collector named in ``sources.yml``, then one matching the source ID, then generic HTML."""

    if config.collector:
        if config.collector not in COLLECTORS:
            raise ValueError(f"알 수 없는 수집기: {config.collector} (출처 {config.id})")
        return COLLECTORS[config.collector](config, client)
    return COLLECTORS.get(config.id, COLLECTORS[DEFAULT_COLLECTOR])(config, client)
