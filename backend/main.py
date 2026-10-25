"""Read-only API over the January 2026 snapshot. Run: uv run uvicorn backend.main:app --reload"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles

from backend import models
from backend.config import (
    BIAS_WINDOW_DAYS,
    DEFAULT_GATE,
    DELIVERY_FIRST,
    DELIVERY_LAST,
    GATES,
    MARGIN_WINDOW_DAYS,
    WEB_DIST,
    GateId,
)
from backend.store import get_store

ATTRIBUTION = "Contains BMRS data © Elexon Limited copyright and database right 2026"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Build the tables before the first request, not during it.
    get_store()
    yield


app = FastAPI(title="GB wind forecast at the gate", lifespan=lifespan)


@app.middleware("http")
async def cache_data(request: Request, call_next) -> Response:
    response = await call_next(request)
    path = request.url.path
    if response.status_code != 200:
        return response
    # Vite fingerprints asset names, so they never change under the same URL.
    if path.startswith("/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    # The snapshot only changes on deploy, so the CDN can hold API answers.
    elif path.startswith("/api/") and path != "/api/health":
        response.headers["Cache-Control"] = "public, max-age=300, s-maxage=86400"
    return response


@app.get("/api/health", response_model=models.Health)
async def health() -> dict:
    store = get_store()
    return {"status": "ok", "snapshot_pulled_at": store.pulled_at, "january_hours": len(store.january(DEFAULT_GATE))}


@app.get("/api/meta", response_model=models.Meta)
async def meta() -> dict:
    return {
        "gates": [{"id": k, "label": g.label, "closes_uk": g.closes.strftime("%H:%M")} for k, g in GATES.items()],
        "default_gate": DEFAULT_GATE,
        "delivery_first": DELIVERY_FIRST,
        "delivery_last": DELIVERY_LAST,
        "margin_window_days": MARGIN_WINDOW_DAYS,
        "bias_window_days": BIAS_WINDOW_DAYS,
        "snapshot_pulled_at": get_store().pulled_at,
        "attribution": ATTRIBUTION,
    }


@app.get("/api/decision", response_model=models.Decision, response_model_exclude_none=True)
async def decision(day: date, gate: GateId = DEFAULT_GATE) -> dict:
    if not DELIVERY_FIRST <= day <= DELIVERY_LAST:
        raise HTTPException(422, f"day must be a delivery day from {DELIVERY_FIRST} to {DELIVERY_LAST}")
    return get_store().decision(day, gate)


@app.get("/api/accuracy", response_model=models.Accuracy, response_model_exclude_none=True)
async def accuracy(gate: GateId = DEFAULT_GATE) -> dict:
    return {"gate": gate} | get_store().accuracy(gate)


@app.get("/api/track-record", response_model=models.TrackRecord, response_model_exclude_none=True)
async def track_record() -> dict:
    return get_store().track_record()


# Mounted last so the API routes above win. Absent in API-only runs before the web build.
if WEB_DIST.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
