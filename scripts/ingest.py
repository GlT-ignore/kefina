"""Refetch the Elexon snapshot in data/ from the public Insights API (no key needed).

Usage: uv run python -m scripts.ingest
"""

import hashlib
import json
import time
from datetime import UTC, date, datetime, timedelta

import httpx
import pandas as pd

from backend.config import DATA

API = "https://data.elexon.co.uk/bmrs/api/v1/datasets"

# Actuals by settlement date; forecasts by publish time, from a few days earlier so the
# first delivery days have every run. September is warm-up for the 28-day trailing window.
ACTUALS_FROM, ACTUALS_TO = date(2025, 8, 31), date(2026, 2, 4)
FORECASTS_FROM, FORECASTS_TO = date(2025, 8, 29), date(2026, 2, 2)


def _require(rows: list[dict], fields: tuple[str, ...]) -> None:
    for i, row in enumerate(rows):
        missing = [f for f in fields if row.get(f) is None]
        if missing:
            raise ValueError(f"row {i} is missing {', '.join(missing)}: {row}")


def actuals_frame(rows: list[dict]) -> pd.DataFrame:
    """FUELHH rows -> [start_time, publish_time, mw], WIND only, latest publish per half-hour."""
    wind = [r for r in rows if r.get("fuelType") == "WIND"]
    _require(wind, ("startTime", "publishTime", "generation"))
    df = pd.DataFrame(
        {
            "start_time": [r["startTime"] for r in wind],
            "publish_time": [r["publishTime"] for r in wind],
            "mw": [r["generation"] for r in wind],
        }
    )
    df = df.sort_values(["start_time", "publish_time"]).drop_duplicates("start_time", keep="last")
    return df.reset_index(drop=True)


def forecasts_frame(rows: list[dict]) -> pd.DataFrame:
    """WINDFOR rows -> [publish_time, start_time, mw], backcasts kept (the core drops them)."""
    _require(rows, ("publishTime", "startTime", "generation"))
    df = pd.DataFrame(
        {
            "publish_time": [r["publishTime"] for r in rows],
            "start_time": [r["startTime"] for r in rows],
            "mw": [r["generation"] for r in rows],
        }
    )
    df = df.drop_duplicates(["publish_time", "start_time"], keep="last")
    return df.sort_values(["publish_time", "start_time"]).reset_index(drop=True)


def _months(first: date, last: date) -> list[tuple[date, date]]:
    spans, start = [], first
    while start <= last:
        nxt = (start.replace(day=1) + timedelta(days=32)).replace(day=1)
        spans.append((start, min(nxt - timedelta(days=1), last)))
        start = nxt
    return spans


def _get(client: httpx.Client, path: str, params: dict) -> list[dict]:
    delay = 1
    while True:
        try:
            res = client.get(f"{API}/{path}", params=params)
            res.raise_for_status()
            return res.json()
        except httpx.HTTPError:
            if delay > 8:
                raise
            time.sleep(delay)
            delay *= 2


def _write(df: pd.DataFrame, name: str) -> dict:
    path = DATA / name
    tmp = path.with_suffix(".tmp")
    # mtime=0 keeps the gzip bytes identical across runs, so git only sees real changes.
    df.to_csv(tmp, index=False, compression={"method": "gzip", "mtime": 0})
    tmp.replace(path)
    return {"file": name, "rows": len(df), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def main() -> None:
    actual_rows: list[dict] = []
    forecast_rows: list[dict] = []
    with httpx.Client(timeout=60) as client:
        for start, end in _months(ACTUALS_FROM, ACTUALS_TO):
            params = {"settlementDateFrom": start.isoformat(), "settlementDateTo": end.isoformat(), "fuelType": "WIND"}
            actual_rows += _get(client, "FUELHH/stream", params)
        for start, end in _months(FORECASTS_FROM, FORECASTS_TO):
            params = {
                "publishDateTimeFrom": f"{start.isoformat()}T00:00:00Z",
                "publishDateTimeTo": f"{(end + timedelta(days=1)).isoformat()}T00:00:00Z",
            }
            forecast_rows += _get(client, "WINDFOR/stream", params)
    DATA.mkdir(exist_ok=True)
    manifest = {
        "pulled_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": API,
        "actuals": {"settlement_dates": [ACTUALS_FROM.isoformat(), ACTUALS_TO.isoformat()]}
        | _write(actuals_frame(actual_rows), "fuelhh_wind.csv.gz"),
        "forecasts": {"publish_dates": [FORECASTS_FROM.isoformat(), FORECASTS_TO.isoformat()]}
        | _write(forecasts_frame(forecast_rows), "windfor.csv.gz"),
    }
    (DATA / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
