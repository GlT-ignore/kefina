"""Choose the trailing window lengths on October to December 2025, before January is scored.

Writes data/windows.json. The chosen values are copied by hand into backend/config.py,
and a test fails if the two ever disagree. Usage: uv run python -m scripts.select_windows
"""

import json

import pandas as pd

from backend import core
from backend.config import CALIBRATION_FIRST, CALIBRATION_LAST, CANDIDATE_WINDOWS, DATA, DEFAULT_GATE
from backend.store import Store, get_store

# A P90 margin aims to cover 90% of hours.
TARGET_COVERAGE = 0.9


def calibration_rows(store: Store) -> pd.DataFrame:
    """09:20 errors for calibration delivery days, with every candidate window computed.

    Trailing stats run on the full history (they only look back), then the frame is cut
    to the calibration days, so nothing from January can reach the selection.
    """
    errors = store.errors[DEFAULT_GATE].copy()
    cols = []
    for n in CANDIDATE_WINDOWS:
        errors[f"margin_{n}"] = core.trailing_margin(errors, errors["cutoff"], n)
        errors[f"bias_{n}"] = core.trailing_bias(errors, errors["cutoff"], n)
        cols += [f"margin_{n}", f"bias_{n}"]
    calibration = core.in_window(errors, core.delivery_window(CALIBRATION_FIRST, CALIBRATION_LAST))
    return calibration.dropna(subset=cols)


def select(calibration: pd.DataFrame) -> dict:
    """Margin: coverage closest to 90%. Bias: smallest total GWh short plus GWh over."""
    actual, forecast = calibration["actual_mw"], calibration["forecast_mw"]
    margin = {n: core.coverage(calibration["error_mw"], calibration[f"margin_{n}"]) for n in CANDIDATE_WINDOWS}
    bias = {}
    for n in CANDIDATE_WINDOWS:
        res = core.policy_backtest(core.counted_volume(forecast, calibration[f"bias_{n}"]), actual)
        bias[n] = res["gwh_short"] + res["gwh_over"]
    return {
        "gate": DEFAULT_GATE,
        "calibration_days": [CALIBRATION_FIRST.isoformat(), CALIBRATION_LAST.isoformat()],
        "hours": len(calibration),
        "margin_coverage": {str(n): round(v, 4) for n, v in margin.items()},
        "bias_total_mismatch_gwh": {str(n): round(v, 1) for n, v in bias.items()},
        "margin_days": min(margin, key=lambda n: abs(margin[n] - TARGET_COVERAGE)),
        "bias_days": min(bias, key=bias.get),
    }


def main() -> None:
    report = select(calibration_rows(get_store()))
    (DATA / "windows.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
