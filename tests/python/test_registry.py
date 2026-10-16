import pytest

from pipeline.collectors.html import StructuredHtmlCollector
from pipeline.collectors.registry import create_collector
from pipeline.collectors.wevity import WevityCollector
from pipeline.config import SourceConfig, load_sources


def source(source_id: str, collector: str | None = None) -> SourceConfig:
    return SourceConfig(
        id=source_id, name=source_id, kind="aggregate", priority=40, schedule="fast",
        mode="html", list_url="https://example.org/", homepage="https://example.org/", collector=collector,
    )


def test_source_id_selects_dedicated_collector():
    assert isinstance(create_collector(source("wevity")), WevityCollector)


def test_unknown_source_falls_back_to_generic_html():
    assert type(create_collector(source("onoffmix"))) is StructuredHtmlCollector


def test_explicit_collector_overrides_source_id():
    assert isinstance(create_collector(source("wevity_mirror", collector="wevity")), WevityCollector)


def test_misspelled_collector_is_rejected():
    with pytest.raises(ValueError):
        create_collector(source("wevity", collector="wevitty"))


def test_every_configured_source_has_a_collector():
    sources, _ = load_sources()
    for config in sources:
        create_collector(config)
