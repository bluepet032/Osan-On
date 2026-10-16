from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

from pipeline.config import SourceConfig
from pipeline.http import HttpClient
from pipeline.models import RawOpportunity


class CollectorStructureError(RuntimeError):
    pass


class Collector(ABC):
    def __init__(self, config: SourceConfig, client: HttpClient | None = None):
        self.config = config
        self.client = client or HttpClient()

    @abstractmethod
    def collect(self, now: datetime, limit: int = 30) -> list[RawOpportunity]:
        raise NotImplementedError

