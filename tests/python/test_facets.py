from datetime import datetime
from zoneinfo import ZoneInfo

from pipeline.facets import facet_coverage
from pipeline.models import RawOpportunity
from pipeline.normalize import normalize


def test_facet_coverage_counts_items_that_state_how_to_apply():
    now = datetime(2026, 10, 16, tzinfo=ZoneInfo("Asia/Seoul"))
    raw = lambda key, methods: RawOpportunity(source_id="t", source_name="t", source_url=f"https://example.com/{key}", title=key, apply_methods=methods)
    items = [normalize(raw("a", ["online", "visit"]), now), normalize(raw("b", []), now)]

    assert facet_coverage(items) == {"apply": 0.5}
    assert facet_coverage([]) is None
