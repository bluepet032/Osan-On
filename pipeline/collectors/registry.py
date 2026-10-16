from __future__ import annotations

from pipeline.collectors.base import Collector
from pipeline.collectors.bizinfo import BizinfoCollector
from pipeline.collectors.dacon import DaconCollector
from pipeline.collectors.dev_event import DevEventCollector
from pipeline.collectors.eventus import EventusCollector
from pipeline.collectors.html import StructuredHtmlCollector
from pipeline.collectors.kocca import KoccaCollector
from pipeline.collectors.kstartup import KStartupCollector
from pipeline.collectors.linkareer import LinkareerCollector
from pipeline.collectors.momo365 import Momo365Collector
from pipeline.collectors.nipa import NipaCollector
from pipeline.collectors.gcon import GconCollector
from pipeline.collectors.thinkcontest import ThinkContestCollector
from pipeline.collectors.wevity import WevityCollector
from pipeline.config import SourceConfig
from pipeline.http import HttpClient


DEFAULT_COLLECTOR = "html"
COLLECTORS: dict[str, type[Collector]] = {
    "bizinfo": BizinfoCollector,
    "dacon": DaconCollector,
    "dev_event": DevEventCollector,
    "eventus": EventusCollector,
    "gcon": GconCollector,
    "html": StructuredHtmlCollector,
    "kocca": KoccaCollector,
    "kstartup": KStartupCollector,
    "linkareer": LinkareerCollector,
    "momo365": Momo365Collector,
    "nipa": NipaCollector,
    "thinkcontest": ThinkContestCollector,
    "wevity": WevityCollector,
}


def create_collector(config: SourceConfig, client: HttpClient | None = None) -> Collector:
    """Pick the collector named in ``sources.yml``, then one matching the source ID, then generic HTML."""

    if config.collector:
        if config.collector not in COLLECTORS:
            raise ValueError(f"알 수 없는 수집기: {config.collector} (출처 {config.id})")
        return COLLECTORS[config.collector](config, client)
    return COLLECTORS.get(config.id, COLLECTORS[DEFAULT_COLLECTOR])(config, client)
