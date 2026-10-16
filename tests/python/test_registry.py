import pytest

from pipeline.collectors.gov24 import Gov24Collector
from pipeline.collectors.html import StructuredHtmlCollector
from pipeline.collectors.registry import create_collector
from pipeline.config import SourceConfig, load_sources


def source(source_id: str, collector: str | None = None) -> SourceConfig:
    return SourceConfig(
        id=source_id, name=source_id, kind="aggregate", priority=40, schedule="fast",
        mode="html", list_url="https://example.org/", homepage="https://example.org/", collector=collector,
    )


def test_source_id_selects_dedicated_collector():
    assert isinstance(create_collector(source("gov24")), Gov24Collector)


def test_unknown_source_falls_back_to_generic_html():
    assert type(create_collector(source("onoffmix"))) is StructuredHtmlCollector


def test_explicit_collector_overrides_source_id():
    assert isinstance(create_collector(source("gov24_mirror", collector="gov24")), Gov24Collector)


def test_misspelled_collector_is_rejected():
    with pytest.raises(ValueError):
        create_collector(source("gov24", collector="gov42"))


def test_every_configured_source_has_a_collector():
    sources, _ = load_sources()
    for config in sources:
        create_collector(config)
