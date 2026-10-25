"""Builds the per-gate error tables once per process and answers API questions from them."""

import json
from datetime import date
from functools import cache

import pandas as pd

from backend import core
from backend.config import (
    BIAS_WINDOW_DAYS,
    DATA,
    DEFAULT_GATE,
    DELIVERY_FIRST,
    DELIVERY_LAST,
    GATES,
    MARGIN_WINDOW_DAYS,
)

# Monthly bias shown beside January, so a reader can see January is not a one-off.
MONTHS = ((2025, 10), (2025, 11), (2025, 12), (2026, 1))


def iso(ts: pd.Timestamp) -> str:
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def _num(x: float) -> float | None:
    return None if pd.isna(x) else float(x)


class Store:
    def __init__(self, actuals: pd.DataFrame, forecasts: pd.DataFrame, pulled_at: str):
        self.pulled_at = pulled_at
        self.forecasts = forecasts
        self.hourly = hourly = core.hourly_actuals(actuals)
        self.errors = {}
        for gate_id, gate in GATES.items():
            cutoffs = core.cutoffs_for(hourly["start_time"], core.gate_rule(gate.closes))
            errors = core.pair(core.latest_forecasts(forecasts, cutoffs), hourly)
            errors["margin_mw"] = core.trailing_margin(errors, errors["cutoff"], MARGIN_WINDOW_DAYS)
            errors["bias_adj_mw"] = core.trailing_bias(errors, errors["cutoff"], BIAS_WINDOW_DAYS)
            self.errors[gate_id] = errors

    def january(self, gate_id: str) -> pd.DataFrame:
        return core.in_window(self.errors[gate_id], core.delivery_window(DELIVERY_FIRST, DELIVERY_LAST))

    def drift(self, day: date, cutoff: pd.Timestamp) -> list[dict]:
        """Every run that forecast this delivery day, published in the two days before it starts."""
        window = core.delivery_window(day, day)
        rows = core.in_window(self.forecasts, window)
        rows = core.in_window(rows, (window[0] - pd.Timedelta(days=2), window[0]), col="publish_time")
        return [
            {
                "publish_time": iso(publish_time),
                "after_gate": bool(publish_time >= cutoff),
                "points": [{"start_time": iso(r.start_time), "forecast_mw": r.forecast_mw} for r in g.itertuples()],
            }
            for publish_time, g in rows.groupby("publish_time")
        ]

    def decision(self, day: date, gate_id: str) -> dict:
        rows = core.in_window(self.errors[gate_id], core.delivery_window(day, day))
        runs = rows.groupby("publish_time").size()
        cutoff = core.gate_cutoff(day, GATES[gate_id].closes)
        return {
            "day": day.isoformat(),
            "gate": gate_id,
            "cutoff": iso(cutoff),
            "drift": self.drift(day, cutoff),
            "runs_used": [{"publish_time": iso(t), "hours": int(n)} for t, n in runs.items()],
            "hours": [
                {
                    "start_time": iso(r.start_time),
                    "publish_time": iso(r.publish_time),
                    "horizon_h": r.horizon_h,
                    "forecast_mw": r.forecast_mw,
                    "actual_mw": r.actual_mw,
                    "error_mw": r.error_mw,
                    "margin_mw": _num(r.margin_mw),
                    "bias_adj_mw": _num(r.bias_adj_mw),
                }
                for r in rows.itertuples()
            ],
        }

    def accuracy(self, gate_id: str) -> dict:
        jan = self.january(gate_id)
        all_runs = core.pair(
            core.in_window(self.forecasts, core.delivery_window(DELIVERY_FIRST, DELIVERY_LAST)), self.hourly
        )
        by_lead = all_runs.groupby(core.horizon_bucket(all_runs["horizon_h"]), observed=True)
        by_day = jan.groupby(jan["start_time"].dt.tz_convert(core.UK_TZ).dt.date)
        daily = [
            {"day": day.isoformat(), "mae_mw": g["error_mw"].abs().mean(), "bias_mw": g["error_mw"].mean()}
            for day, g in by_day
        ]
        by_hour = jan.groupby(jan["start_time"].dt.tz_convert(core.UK_TZ).dt.hour)
        return {
            "headline": core.error_metrics(jan["forecast_mw"], jan["actual_mw"]),
            "by_lead_time": [
                {"bucket": str(bucket)} | core.error_metrics(g["forecast_mw"], g["actual_mw"]) for bucket, g in by_lead
            ],
            "monthly": [self._month(gate_id, year, month) for year, month in MONTHS],
            "daily": daily,
            "worst_days": sorted(daily, key=lambda d: d["mae_mw"], reverse=True)[:5],
            "coverage_by_hour": [
                {
                    "hour": int(hour),
                    "n": len(g),
                    "bias_mw": g["error_mw"].mean(),
                    "margin_coverage": core.coverage(g["error_mw"], g["margin_mw"]),
                }
                for hour, g in by_hour
            ],
        }

    def _month(self, gate_id: str, year: int, month: int) -> dict:
        g = core.in_window(self.errors[gate_id], core.month_window(year, month))
        return {
            "month": f"{year}-{month:02d}",
            "n": len(g),
            "bias_mw": g["error_mw"].mean(),
            "mae_mw": g["error_mw"].abs().mean(),
        }

    def track_record(self) -> dict:
        jan = self.january(DEFAULT_GATE)
        counted = {
            "raw": jan["forecast_mw"],
            "bias": core.counted_volume(jan["forecast_mw"], jan["bias_adj_mw"]),
            "margin": core.counted_volume(jan["forecast_mw"], jan["margin_mw"]),
        }
        rules = {rule: {"rule": rule} | core.policy_backtest(c, jan["actual_mw"]) for rule, c in counted.items()}
        rules["margin"]["coverage"] = core.coverage(jan["error_mw"], jan["margin_mw"])
        calibration = json.loads((DATA / "windows.json").read_text(encoding="utf-8"))
        return {"gate": DEFAULT_GATE, "january": list(rules.values()), "calibration": calibration}


@cache
def get_store() -> Store:
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    return Store(
        core.load_actuals(DATA / "fuelhh_wind.csv.gz"),
        core.load_forecasts(DATA / "windfor.csv.gz"),
        manifest["pulled_at"],
    )
