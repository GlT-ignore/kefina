import json

import pandas as pd
import pytest

from backend.config import BIAS_WINDOW_DAYS, DATA, MARGIN_WINDOW_DAYS
from backend.store import get_store
from scripts import select_windows


@pytest.fixture(scope="module")
def calibration():
    return select_windows.calibration_rows(get_store())


def test_calibration_never_sees_january(calibration):
    assert calibration["start_time"].max() < pd.Timestamp("2026-01-01", tz="UTC")
    assert len(calibration) == 2209


def test_selection_on_calibration_gives_the_frozen_windows(calibration):
    report = select_windows.select(calibration)
    assert (report["margin_days"], report["bias_days"]) == (MARGIN_WINDOW_DAYS, BIAS_WINDOW_DAYS)


def test_committed_report_matches_a_fresh_run(calibration):
    committed = json.loads((DATA / "windows.json").read_text(encoding="utf-8"))
    assert committed == json.loads(json.dumps(select_windows.select(calibration)))
