"""Response contract. Times are ISO 8601 UTC strings ending in Z; energy is MW or GWh."""

from datetime import date
from typing import Literal

from pydantic import BaseModel


class Gate(BaseModel):
    id: str
    label: str
    closes_uk: str


class Meta(BaseModel):
    gates: list[Gate]
    default_gate: str
    delivery_first: date
    delivery_last: date
    margin_window_days: int
    bias_window_days: int
    snapshot_pulled_at: str
    attribution: str


class Health(BaseModel):
    status: Literal["ok"]
    snapshot_pulled_at: str
    january_hours: int


class RunUsed(BaseModel):
    publish_time: str
    hours: int


class Hour(BaseModel):
    start_time: str
    publish_time: str
    horizon_h: float
    forecast_mw: float
    actual_mw: float
    error_mw: float
    margin_mw: float | None = None
    bias_adj_mw: float | None = None


class DriftPoint(BaseModel):
    start_time: str
    forecast_mw: float


class DriftRun(BaseModel):
    publish_time: str
    after_gate: bool
    points: list[DriftPoint]


class Decision(BaseModel):
    day: date
    gate: str
    cutoff: str
    runs_used: list[RunUsed]
    hours: list[Hour]
    drift: list[DriftRun]


class Metrics(BaseModel):
    n: int
    mae_mw: float | None = None
    rmse_mw: float | None = None
    bias_mw: float | None = None
    mean_actual_mw: float | None = None
    nmae_pct: float | None = None
    share_over: float | None = None
    p10_mw: float | None = None
    p50_mw: float | None = None
    p90_mw: float | None = None
    worst_over_mw: float | None = None


class LeadTimeBucket(Metrics):
    bucket: str


class Month(BaseModel):
    month: str
    n: int
    bias_mw: float
    mae_mw: float


class DayMiss(BaseModel):
    day: date
    mae_mw: float
    bias_mw: float


class HourOfDay(BaseModel):
    hour: int
    n: int
    bias_mw: float
    margin_coverage: float


class Accuracy(BaseModel):
    gate: str
    headline: Metrics
    by_lead_time: list[LeadTimeBucket]
    monthly: list[Month]
    daily: list[DayMiss]
    worst_days: list[DayMiss]
    coverage_by_hour: list[HourOfDay]


class Rule(BaseModel):
    rule: Literal["raw", "bias", "margin"]
    n: int
    gwh_short: float
    gwh_over: float
    hours_short: int
    coverage: float | None = None


class Calibration(BaseModel):
    gate: str
    calibration_days: list[date]
    hours: int
    margin_coverage: dict[str, float]
    bias_total_mismatch_gwh: dict[str, float]
    margin_days: int
    bias_days: int


class TrackRecord(BaseModel):
    gate: str
    january: list[Rule]
    calibration: Calibration
