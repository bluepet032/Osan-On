from pipeline.alerts import source_alerts


def status(source_id: str, state: str, failures: int, collected: int = 20, previous: int | None = 20) -> dict:
    return {
        "source_id": source_id, "source_name": source_id, "status": state,
        "finished_at": "2026-10-06T10:00:00+09:00", "consecutive_failures": failures,
        "collected_count": collected, "previous_collected_count": previous,
        "error": "요청 실패" if state == "failed" else None,
    }


def titles(items: list[dict]) -> list[str]:
    return [item["title"] for item in items]


def test_sources_at_threshold_need_an_issue_and_successes_can_close_one():
    alerts = source_alerts({"items": [
        status("bizinfo", "failed", 2),
        status("kocca", "failed", 1),
        status("wevity", "success", 0),
    ]})

    assert titles(alerts["failing"]) == ["[수집 실패] bizinfo"]
    assert "2회 연속 실패" in alerts["failing"][0]["body"]
    assert titles(alerts["recovered"]) == ["[수집 실패] wevity", "[수집 급감] wevity"]


def test_failures_below_threshold_neither_open_nor_close_issues():
    alerts = source_alerts({"items": [status("kocca", "failed", 1)]})

    assert alerts == {"failing": [], "recovered": []}


def test_sharp_drop_against_previous_success_opens_an_issue():
    alerts = source_alerts({"items": [
        status("wevity", "success", 0, collected=40, previous=100),
        status("nipa", "success", 0, collected=4, previous=8),
        status("dacon", "success", 0, collected=60, previous=100),
    ]})

    assert titles(alerts["failing"]) == ["[수집 급감] wevity"]
    assert "100건에서 40건" in alerts["failing"][0]["body"]
    assert "[수집 급감] nipa" in titles(alerts["recovered"])
    assert "[수집 급감] dacon" in titles(alerts["recovered"])


def test_drop_checks_can_be_skipped_for_partial_manual_runs():
    alerts = source_alerts({"items": [status("wevity", "success", 0, collected=5, previous=100)]}, check_drops=False)

    assert titles(alerts["failing"]) == []
    assert titles(alerts["recovered"]) == ["[수집 실패] wevity"]


def covered(source_id: str, current: dict | None, previous: dict | None, collected: int = 20) -> dict:
    return {**status(source_id, "success", 0, collected=collected), "facet_coverage": current, "previous_facet_coverage": previous}


def test_filter_coverage_drop_opens_an_issue_and_recovery_closes_it():
    alerts = source_alerts({"items": [
        covered("linkareer", {"prize": 0.1, "audience": 0.95, "region": 0.0}, {"prize": 0.9, "audience": 1.0, "region": 0.05}),
        covered("bizinfo", {"region": 0.6}, {"region": 0.7}),
    ]})

    coverage = [item for item in alerts["failing"] if item["title"].startswith("[필터 정보 급감]")]
    assert titles(coverage) == ["[필터 정보 급감] linkareer"]
    # Region started below the 20% baseline, so its fall to 0% is noise rather than breakage.
    assert "상금: 90% → 10%" in coverage[0]["body"]
    assert "지역" not in coverage[0]["body"] and "참가 대상" not in coverage[0]["body"]
    assert "[필터 정보 급감] bizinfo" in titles(alerts["recovered"])


def test_filter_coverage_is_not_judged_without_data_or_with_few_items():
    alerts = source_alerts({"items": [
        covered("nipa", {"prize": 0.0}, {"prize": 1.0}, collected=3),
        covered("dacon", None, {"prize": 1.0}),
    ]})

    assert not any("필터 정보" in title for title in titles(alerts["failing"]) + titles(alerts["recovered"]))


def test_filter_coverage_checks_follow_skip_drops():
    alerts = source_alerts({"items": [covered("linkareer", {"prize": 0.0}, {"prize": 0.9})]}, check_drops=False)

    assert titles(alerts["failing"]) == []
