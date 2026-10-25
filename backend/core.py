"""Pure logic for comparing Elexon WINDFOR wind forecasts with FUELHH WIND actuals.

All timestamps are tz-aware UTC. Error is forecast minus actual (MW): positive means
the forecast overstated wind and a buyer who trusted it was short.
"""

from collections.abc import Callable, Iterable
from datetime import date, time, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

UK_TZ = "Europe/London"
HORIZON_EDGES = (0, 6, 12, 18, 24, 30, 36, 42, 48, np.inf)

CutoffRule = Callable[[pd.Timestamp], pd.Timestamp]


def utc(values) -> pd.Series:
    # pandas 3 infers the time unit per column; merge_asof needs matching units.
    return pd.Series(pd.to_datetime(values, utc=True)).astype("datetime64[ns, UTC]")


def load_actuals(path: str | Path) -> pd.DataFrame:
    """Snapshot CSV -> [start_time, publish_time, actual_mw], one row per half-hour."""
    df = pd.read_csv(path)
    return pd.DataFrame(
        {
            "start_time": utc(df["start_time"]),
            "publish_time": utc(df["publish_time"]),
            "actual_mw": df["mw"].astype(float),
        }
    )


def load_forecasts(path: str | Path) -> pd.DataFrame:
    """Snapshot CSV -> [publish_time, start_time, forecast_mw, horizon_h].

    Each run also restates up to about 25 past hours. Those rows have horizon <= 0
    and are not forecasts, so they are dropped here.
    """
    df = pd.read_csv(path)
    out = pd.DataFrame(
        {
            "publish_time": utc(df["publish_time"]),
            "start_time": utc(df["start_time"]),
            "forecast_mw": df["mw"].astype(float),
        }
    )
    out["horizon_h"] = (out["start_time"] - out["publish_time"]).dt.total_seconds() / 3600
    return out[out["horizon_h"] > 0].reset_index(drop=True)


def latest_forecasts(forecasts: pd.DataFrame, cutoffs: pd.DataFrame) -> pd.DataFrame:
    """For each [start_time, cutoff], the newest run published strictly before the cutoff.

    Strict because a run stamped exactly at gate closure (15:30 runs vs the 15:30
    auction) could not have fed the bid. Targets with no eligible run get NaN.
    """
    merged = pd.merge_asof(
        cutoffs.sort_values("cutoff").reset_index(drop=True),
        forecasts.sort_values("publish_time"),
        left_on="cutoff",
        right_on="publish_time",
        by="start_time",
        direction="backward",
        allow_exact_matches=False,
    )
    return merged.sort_values("start_time").reset_index(drop=True)


def delivery_day(target_time: pd.Timestamp) -> date:
    return target_time.tz_convert(UK_TZ).date()


def gate_cutoff(day: date, gate: time) -> pd.Timestamp:
    """Gate closure for delivery day `day`: UK clock time `gate` on the day before, as UTC."""
    local = pd.Timestamp.combine(day - timedelta(days=1), gate).tz_localize(UK_TZ)
    return local.tz_convert("UTC")


def gate_rule(gate: time) -> CutoffRule:
    return lambda target: gate_cutoff(delivery_day(target), gate)


def cutoffs_for(targets: Iterable[pd.Timestamp], rule: CutoffRule) -> pd.DataFrame:
    targets = utc(list(targets))
    return pd.DataFrame({"start_time": targets, "cutoff": utc(targets.map(rule))})


def delivery_window(first_day: date, last_day: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Half-open UTC range covering UK delivery days first_day..last_day inclusive."""
    start = pd.Timestamp(first_day).tz_localize(UK_TZ)
    end = pd.Timestamp(last_day + timedelta(days=1)).tz_localize(UK_TZ)
    return start.tz_convert("UTC"), end.tz_convert("UTC")


def month_window(year: int, month: int) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Half-open UTC range of a UK calendar month."""
    start = pd.Timestamp(year=year, month=month, day=1).tz_localize(UK_TZ)
    return start.tz_convert("UTC"), (start + pd.offsets.MonthBegin(1)).tz_convert("UTC")


def in_window(df: pd.DataFrame, window: tuple[pd.Timestamp, pd.Timestamp], col: str = "start_time") -> pd.DataFrame:
    start, end = window
    return df[(df[col] >= start) & (df[col] < end)]


def hourly_actuals(actuals: pd.DataFrame) -> pd.DataFrame:
    """Half-hourly actuals -> hourly [start_time, known_at, actual_mw].

    The hourly value is the mean of both half-hours (energy in the hour), kept only
    when both exist. known_at is when the later half-hour was published.
    """
    grouped = actuals.groupby(actuals["start_time"].dt.floor("h")).agg(
        actual_mw=("actual_mw", "mean"), known_at=("publish_time", "max"), count=("actual_mw", "size")
    )
    grouped = grouped[grouped["count"] == 2]
    return pd.DataFrame(
        {
            "start_time": grouped.index,
            "known_at": grouped["known_at"].to_numpy(),
            "actual_mw": grouped["actual_mw"].to_numpy(),
        }
    )


def pair(forecast_rows: pd.DataFrame, actuals_hourly: pd.DataFrame) -> pd.DataFrame:
    """Inner-join forecasts with hourly actuals and add error_mw."""
    df = forecast_rows.dropna(subset=["forecast_mw"]).merge(actuals_hourly, on="start_time", how="inner")
    df["error_mw"] = df["forecast_mw"] - df["actual_mw"]
    return df


def error_metrics(forecast: Iterable[float], actual: Iterable[float]) -> dict[str, float]:
    f = np.asarray(forecast, dtype=float)
    a = np.asarray(actual, dtype=float)
    err = f - a
    if err.size == 0:
        return {"n": 0}
    p10, p50, p90 = np.percentile(err, [10, 50, 90])
    mae = float(np.abs(err).mean())
    mean_actual = float(a.mean())
    return {
        "n": int(err.size),
        "mae_mw": mae,
        "rmse_mw": float(np.sqrt((err**2).mean())),
        "bias_mw": float(err.mean()),
        "mean_actual_mw": mean_actual,
        "nmae_pct": mae / mean_actual * 100,
        "share_over": float((err > 0).mean()),
        "p10_mw": float(p10),
        "p50_mw": float(p50),
        "p90_mw": float(p90),
        "worst_over_mw": float(err.max()),
    }


def coverage(errors: Iterable[float], margin_mw: Iterable[float] | float) -> float:
    """Share of hours where the margin covered the shortfall (error <= margin)."""
    return float((np.asarray(errors, dtype=float) <= np.asarray(margin_mw, dtype=float)).mean())


def horizon_bucket(horizon_h: pd.Series) -> pd.Series:
    edges = HORIZON_EDGES
    labels = [f"{lo}-{hi}h" if np.isfinite(hi) else f"{lo}h+" for lo, hi in zip(edges[:-1], edges[1:], strict=True)]
    return pd.cut(horizon_h, bins=list(edges), labels=labels, right=True)


def trailing_stats(history: pd.DataFrame, cutoffs: pd.Series, window_days: int, min_hours: int) -> pd.DataFrame:
    """Per cutoff: mean error, P90 error and n over the trailing window, no look-ahead.

    history has [start_time, known_at, error_mw]. An hour counts only if its actual
    was published strictly before the cutoff and it started within the window.
    Fewer than min_hours of history gives NaN.
    """
    start = utc(history["start_time"]).dt.tz_convert(None).to_numpy()
    known = utc(history["known_at"]).dt.tz_convert(None).to_numpy()
    err = history["error_mw"].to_numpy()
    window = np.timedelta64(window_days, "D")
    cut = utc(cutoffs).dt.tz_convert(None)
    rows = {}
    # Every hour of a delivery day shares one gate cutoff, so compute once per cutoff.
    for c in cut.unique():
        e = err[(known < c) & (start >= c - window)]
        ok = e.size >= min_hours
        rows[c] = (e.mean() if ok else np.nan, np.percentile(e, 90) if ok else np.nan, e.size)
    per_cutoff = pd.DataFrame.from_dict(rows, orient="index", columns=["bias_mw", "p90_mw", "n"])
    return per_cutoff.reindex(cut.to_numpy()).set_axis(cutoffs.index)


def _min_hours(window_days: int, min_hours: int | None) -> int:
    # Default: at least 80% of the window's hours must have a known actual.
    return int(0.8 * 24 * window_days) if min_hours is None else min_hours


def trailing_margin(
    history: pd.DataFrame, cutoffs: pd.Series, window_days: int, min_hours: int | None = None
) -> pd.Series:
    """MW to hold back from the forecast: trailing P90 of error, floored at 0."""
    stats = trailing_stats(history, cutoffs, window_days, _min_hours(window_days, min_hours))
    return stats["p90_mw"].clip(lower=0)


def trailing_bias(
    history: pd.DataFrame, cutoffs: pd.Series, window_days: int, min_hours: int | None = None
) -> pd.Series:
    """MW to subtract from the forecast: trailing mean error."""
    return trailing_stats(history, cutoffs, window_days, _min_hours(window_days, min_hours))["bias_mw"]


def counted_volume(forecast_mw: Iterable[float], adjustment_mw: Iterable[float] | float = 0.0) -> np.ndarray:
    """Forecast minus an adjustment, never below zero."""
    return np.clip(np.asarray(forecast_mw, dtype=float) - np.asarray(adjustment_mw, dtype=float), 0, None)


def policy_backtest(counted_mw: Iterable[float], actual_mw: Iterable[float]) -> dict[str, float]:
    """Score counted volumes against hourly actuals (MW over one hour = MWh).

    Short: actual below counted (the buyer had to cover the gap). Over: actual above
    counted (wind the buyer did not count on). Hours without a counted volume are skipped.
    """
    c = np.asarray(counted_mw, dtype=float)
    a = np.asarray(actual_mw, dtype=float)
    ok = ~np.isnan(c) & ~np.isnan(a)
    gap = c[ok] - a[ok]
    return {
        "n": int(ok.sum()),
        "gwh_short": float(gap[gap > 0].sum() / 1000),
        "gwh_over": float(-gap[gap < 0].sum() / 1000),
        "hours_short": int((gap > 0).sum()),
    }
