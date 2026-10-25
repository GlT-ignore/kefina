from datetime import date

import pytest

from backend.store import get_store


@pytest.fixture(scope="module")
def store():
    return get_store()


def test_january_headline_at_the_0920_gate_matches_the_analysis(store):
    m = store.accuracy("epex_0920")["headline"]
    assert m["n"] == 744
    assert m["mae_mw"] == pytest.approx(2038.9, abs=0.1)
    assert m["bias_mw"] == pytest.approx(1747.9, abs=0.1)
    assert m["rmse_mw"] == pytest.approx(2504.8, abs=0.1)


def test_decision_names_the_run_the_buyer_had_at_the_gate(store):
    d = store.decision(date(2026, 1, 28), "epex_0920")
    assert d["cutoff"] == "2026-01-27T09:20:00Z"
    assert d["runs_used"] == [{"publish_time": "2026-01-27T07:30:00Z", "hours": 24}]
    assert len(d["hours"]) == 24
    first = d["hours"][0]
    assert first["start_time"] == "2026-01-28T00:00:00Z"
    assert first["horizon_h"] == pytest.approx(16.5)


def test_late_run_is_used_when_it_was_the_latest_before_the_gate(store):
    # On 15 Jan the 11:30 run went out at 12:25, so it is the run in hand at 15:30.
    d = store.decision(date(2026, 1, 16), "epex_1530")
    assert d["runs_used"] == [{"publish_time": "2026-01-15T12:25:00Z", "hours": 24}]


def test_drift_shows_every_run_for_the_day_and_flags_runs_after_the_gate(store):
    d = store.decision(date(2026, 1, 28), "epex_0920")
    drift = {run["publish_time"]: run for run in d["drift"]}
    assert drift["2026-01-27T07:30:00Z"]["after_gate"] is False
    after = sorted(t for t, run in drift.items() if run["after_gate"])
    assert after == [f"2026-01-27T{h}:30:00Z" for h in ("09", "11", "15", "18", "22")]
    for run in d["drift"]:
        assert all(p["start_time"].startswith("2026-01-28") for p in run["points"])


def test_track_record_scores_the_frozen_rules_on_january(store):
    rules = {r["rule"]: r for r in store.track_record()["january"]}
    raw, bias, margin = rules["raw"], rules["bias"], rules["margin"]
    assert (raw["gwh_short"], raw["gwh_over"], raw["hours_short"]) == (
        pytest.approx(1409, abs=1),
        pytest.approx(108, abs=1),
        632,
    )
    assert (bias["gwh_short"], bias["gwh_over"], bias["hours_short"]) == (
        pytest.approx(663, abs=1),
        pytest.approx(499, abs=1),
        362,
    )
    assert (margin["gwh_short"], margin["gwh_over"], margin["hours_short"]) == (
        pytest.approx(98, abs=1),
        pytest.approx(1864, abs=1),
        77,
    )
    assert margin["coverage"] == pytest.approx(0.897, abs=0.001)
    assert {r["n"] for r in rules.values()} == {744}


def test_accuracy_by_lead_time_uses_every_run(store):
    buckets = {b["bucket"]: b for b in store.accuracy("epex_0920")["by_lead_time"]}
    assert buckets["0-6h"]["mae_mw"] == pytest.approx(1660, abs=5)
    assert buckets["42-48h"]["mae_mw"] == pytest.approx(2334, abs=5)
    assert buckets["0-6h"]["n"] == 1488


def test_monthly_bias_shows_january_is_not_a_one_off(store):
    months = {m["month"]: round(m["bias_mw"]) for m in store.accuracy("epex_0920")["monthly"]}
    assert months == {"2025-10": 1789, "2025-11": 1007, "2025-12": 1449, "2026-01": 1852}


def test_worst_days_are_ranked_by_daily_mae(store):
    days = [d["day"] for d in store.accuracy("epex_0920")["worst_days"]]
    assert days[:4] == ["2026-01-28", "2026-01-12", "2026-01-11", "2026-01-21"]


def test_margin_coverage_by_hour_of_day(store):
    hours = store.accuracy("epex_0920")["coverage_by_hour"]
    assert [h["hour"] for h in hours] == list(range(24))
    assert {h["n"] for h in hours} == {31}


def test_every_delivery_day_has_its_mean_miss_for_the_day_strip(store):
    daily = store.accuracy("epex_0920")["daily"]
    assert [d["day"] for d in daily][:2] == ["2026-01-02", "2026-01-03"]
    assert len(daily) == 31
    worst = max(daily, key=lambda d: d["mae_mw"])
    assert worst["day"] == store.accuracy("epex_0920")["worst_days"][0]["day"]
