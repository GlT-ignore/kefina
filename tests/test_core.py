from datetime import date, time

import numpy as np
import pandas as pd
import pytest

from backend import core

T = pd.Timestamp


def _forecasts(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["publish_time", "start_time", "forecast_mw"])
    df["publish_time"] = core.utc(df["publish_time"])
    df["start_time"] = core.utc(df["start_time"])
    df["horizon_h"] = (df["start_time"] - df["publish_time"]).dt.total_seconds() / 3600
    return df


TARGET = "2026-01-16T12:00:00Z"
VINTAGES = _forecasts(
    [
        ("2026-01-15T09:30:00Z", TARGET, 100.0),
        ("2026-01-15T15:30:00Z", TARGET, 200.0),
        ("2026-01-15T15:30:01Z", TARGET, 300.0),
    ]
)


def _pick(cutoff: str) -> pd.Series:
    cutoffs = pd.DataFrame({"start_time": core.utc([TARGET]), "cutoff": core.utc([cutoff])})
    return core.latest_forecasts(VINTAGES, cutoffs).iloc[0]


def test_latest_forecast_is_published_strictly_before_the_gate():
    # The 15:30 run is stamped exactly at the 15:30 gate, so the buyer could not have used it.
    assert _pick("2026-01-15T15:30:00Z")["forecast_mw"] == 100.0
    assert _pick("2026-01-15T15:30:01Z")["forecast_mw"] == 200.0
    assert _pick("2026-01-15T15:30:02Z")["forecast_mw"] == 300.0


def test_no_forecast_when_nothing_was_published_before_the_gate():
    assert np.isnan(_pick("2026-01-15T09:30:00Z")["forecast_mw"])


def test_gate_rule_at_1530_picks_the_run_before_the_1530_stamp():
    cutoffs = core.cutoffs_for([T(TARGET)], core.gate_rule(time(15, 30)))
    assert cutoffs["cutoff"].iloc[0] == T("2026-01-15T15:30:00Z")
    picked = core.latest_forecasts(VINTAGES, cutoffs).iloc[0]
    assert picked["publish_time"] == T("2026-01-15T09:30:00Z")


def test_gate_cutoff_is_uk_local_time():
    assert core.gate_cutoff(date(2026, 1, 2), time(9, 20)) == T("2026-01-01T09:20:00Z")
    # In BST the same 09:20 local is 08:20 UTC.
    assert core.gate_cutoff(date(2025, 10, 26), time(9, 20)) == T("2025-10-25T08:20:00Z")


def test_clock_change_day_has_25_hours_and_one_cutoff():
    window = core.delivery_window(date(2025, 10, 26), date(2025, 10, 26))
    hours = pd.date_range(*window, freq="h", inclusive="left")
    assert len(hours) == 25
    cutoffs = core.cutoffs_for(hours, core.gate_rule(time(9, 20)))
    assert set(cutoffs["cutoff"]) == {T("2025-10-25T08:20:00Z")}


def test_delivery_window_for_january_decisions():
    window = core.delivery_window(date(2026, 1, 2), date(2026, 2, 1))
    assert window == (T("2026-01-02T00:00:00Z"), T("2026-02-02T00:00:00Z"))
    hours = pd.DataFrame({"start_time": pd.date_range("2025-12-31", "2026-02-03", freq="h", tz="UTC")})
    assert len(core.in_window(hours, window)) == 744


def test_month_window_follows_uk_calendar():
    assert core.month_window(2025, 10) == (T("2025-09-30T23:00:00Z"), T("2025-11-01T00:00:00Z"))


def test_load_forecasts_drops_backcasts(tmp_path):
    path = tmp_path / "f.csv"
    pd.DataFrame(
        {
            "publish_time": ["2026-01-15T09:30:00Z"] * 3,
            "start_time": ["2026-01-15T09:00:00Z", "2026-01-15T09:30:00Z", "2026-01-15T10:00:00Z"],
            "mw": [1, 2, 3],
        }
    ).to_csv(path, index=False)
    df = core.load_forecasts(path)
    assert df["forecast_mw"].tolist() == [3.0]
    assert df["horizon_h"].tolist() == [0.5]


def test_hourly_actual_is_the_mean_of_both_half_hours():
    actuals = pd.DataFrame(
        {
            "start_time": core.utc(["2026-01-01T00:00Z", "2026-01-01T00:30Z", "2026-01-01T01:00Z"]),
            "actual_mw": [100.0, 200.0, 50.0],
        }
    )
    actuals["publish_time"] = actuals["start_time"] + pd.Timedelta(minutes=30)
    hourly = core.hourly_actuals(actuals)
    # The 01:00 hour lacks its second half-hour, so it has no actual.
    assert hourly["actual_mw"].tolist() == [150.0]
    assert hourly["known_at"].iloc[0] == T("2026-01-01T01:00Z")


def test_error_metrics_on_a_hand_checkable_frame():
    actual = np.array([1000.0, 2000.0, 3000.0, 4000.0])
    forecast = np.array([1500.0, 1500.0, 5500.0, 4000.0])  # errors +500, -500, +2500, 0
    m = core.error_metrics(forecast, actual)
    assert m["n"] == 4
    assert m["mae_mw"] == pytest.approx(875.0)
    assert m["rmse_mw"] == pytest.approx(np.sqrt((500**2 * 2 + 2500**2) / 4))
    assert m["bias_mw"] == pytest.approx(625.0)
    assert m["nmae_pct"] == pytest.approx(875.0 / 2500 * 100)
    assert m["share_over"] == pytest.approx(0.5)
    assert m["p50_mw"] == pytest.approx(250.0)
    assert m["worst_over_mw"] == pytest.approx(2500.0)


def test_coverage_counts_hours_where_the_margin_covered_the_shortfall():
    assert core.coverage([100.0, 500.0, 900.0, -50.0], 500.0) == pytest.approx(0.75)


def test_trailing_stats_only_use_actuals_published_before_the_cutoff():
    starts = pd.date_range("2026-01-01", periods=48, freq="h", tz="UTC")
    history = pd.DataFrame(
        {"start_time": starts, "known_at": starts + pd.Timedelta(hours=1), "error_mw": [100.0] * 24 + [9999.0] * 24}
    )
    # At 00:00 on 2 Jan, hours up to 22:00 are known; the 23:00 actual lands exactly at 00:00.
    stats = core.trailing_stats(history, pd.Series([T("2026-01-02T00:00Z")]), window_days=7, min_hours=23)
    assert stats["bias_mw"].iloc[0] == pytest.approx(100.0)
    assert stats["n"].iloc[0] == 23
    early = core.trailing_stats(history, pd.Series([T("2026-01-01T12:00Z")]), window_days=7, min_hours=24)
    assert np.isnan(early["bias_mw"].iloc[0])


def test_trailing_stats_are_repeated_for_hours_sharing_a_cutoff():
    starts = pd.date_range("2026-01-01", periods=48, freq="h", tz="UTC")
    history = pd.DataFrame({"start_time": starts, "known_at": starts + pd.Timedelta(hours=1), "error_mw": 100.0})
    cut = pd.Series([T("2026-01-03T00:00Z")] * 3 + [T("2026-01-02T12:00Z")])
    stats = core.trailing_stats(history, cut, window_days=7, min_hours=1)
    # The last hour's actual lands exactly at 00:00 on 3 Jan, so only 47 count.
    assert stats["n"].tolist() == [47, 47, 47, 35]
    assert list(stats.index) == list(cut.index)


def _daily_history(days: int, err_by_day: dict[int, float]) -> pd.DataFrame:
    # One hour per day at 12:00 UTC, actual known 1 hour after it starts.
    start = pd.date_range("2026-01-01 12:00", periods=days, freq="D", tz="UTC")
    return pd.DataFrame(
        {
            "start_time": start,
            "known_at": start + pd.Timedelta(hours=1),
            "error_mw": [err_by_day.get(i, 100.0) for i in range(days)],
        }
    )


def test_margin_ignores_an_actual_published_after_the_cutoff():
    hist = _daily_history(10, {9: 9000.0})  # day 9 actual known 2026-01-10 13:00
    before = pd.Series([T("2026-01-10 12:30", tz="UTC")])
    after = pd.Series([T("2026-01-10 13:00:01", tz="UTC")])
    assert core.trailing_margin(hist, before, 7, min_hours=1).iloc[0] == pytest.approx(100.0)
    assert core.trailing_margin(hist, after, 7, min_hours=1).iloc[0] > 1000.0


def test_margin_excludes_an_actual_published_exactly_at_the_cutoff_and_respects_the_window():
    hist = _daily_history(10, {0: 5000.0, 9: 9000.0})
    at = pd.Series([T("2026-01-10 13:00", tz="UTC")])
    assert core.trailing_margin(hist, at, 7, min_hours=1).iloc[0] == pytest.approx(100.0)
    # Day 0 started 9 days before: outside a 7-day window, inside a 14-day one.
    assert core.trailing_margin(hist, at, 14, min_hours=1).iloc[0] > 100.0


def test_margin_is_never_negative():
    hist = _daily_history(5, {i: -300.0 for i in range(5)})
    assert core.trailing_margin(hist, pd.Series([T("2026-01-07", tz="UTC")]), 7, min_hours=1).iloc[0] == 0.0


def test_bias_needs_enough_history():
    hist = _daily_history(3, {})
    cut = pd.Series([T("2026-01-04", tz="UTC")])
    assert np.isnan(core.trailing_bias(hist, cut, 7).iloc[0])
    assert core.trailing_bias(hist, cut, 7, min_hours=3).iloc[0] == pytest.approx(100.0)


def test_policy_backtest_arithmetic():
    counted = core.counted_volume([1000, 2000, 3000, 500], [0, 500, 0, 600])  # 1000, 1500, 3000, 0
    res = core.policy_backtest(counted, [800, 2500, 3000, 100])
    assert list(counted) == [1000, 1500, 3000, 0]
    assert res == {"n": 4, "gwh_short": pytest.approx(0.2), "gwh_over": pytest.approx(1.1), "hours_short": 1}


def test_policy_backtest_skips_hours_without_a_counted_volume():
    res = core.policy_backtest([np.nan, 1000.0], [500.0, 1500.0])
    assert res["n"] == 1 and res["gwh_over"] == pytest.approx(0.5) and res["hours_short"] == 0
