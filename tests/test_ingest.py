import pytest

from scripts import ingest


def test_actuals_keep_wind_only_and_dedupe_by_start_time():
    rows = [
        {
            "fuelType": "WIND",
            "startTime": "2026-01-01T00:00:00Z",
            "publishTime": "2026-01-01T00:30:00Z",
            "generation": 100,
        },
        {
            "fuelType": "CCGT",
            "startTime": "2026-01-01T00:00:00Z",
            "publishTime": "2026-01-01T00:30:00Z",
            "generation": 900,
        },
        {
            "fuelType": "WIND",
            "startTime": "2026-01-01T00:00:00Z",
            "publishTime": "2026-01-01T00:35:00Z",
            "generation": 110,
        },
    ]
    df = ingest.actuals_frame(rows)
    assert list(df.columns) == ["start_time", "publish_time", "mw"]
    assert df["mw"].tolist() == [110]


def test_forecasts_keep_backcasts_and_dedupe_by_run_and_target():
    rows = [
        {"publishTime": "2026-01-01T09:30:00Z", "startTime": "2026-01-01T09:00:00Z", "generation": 1},
        {"publishTime": "2026-01-01T09:30:00Z", "startTime": "2026-01-01T10:00:00Z", "generation": 2},
        {"publishTime": "2026-01-01T09:30:00Z", "startTime": "2026-01-01T10:00:00Z", "generation": 3},
    ]
    df = ingest.forecasts_frame(rows)
    assert list(df.columns) == ["publish_time", "start_time", "mw"]
    assert df["mw"].tolist() == [1, 3]


def test_rows_missing_a_field_are_rejected_with_its_name():
    with pytest.raises(ValueError, match="generation"):
        ingest.forecasts_frame([{"publishTime": "2026-01-01T09:30:00Z", "startTime": "2026-01-01T10:00:00Z"}])
