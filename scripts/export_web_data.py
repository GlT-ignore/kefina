"""Write the opening view's API answers for the web build to prerender.

Usage: uv run python -m scripts.export_web_data [out.json]   (default web/prerender-data.json)
"""

import asyncio
import json
import sys
from datetime import date
from pathlib import Path

from pydantic import BaseModel

from backend import main, models
from backend.config import DEFAULT_GATE

OPENING_DAY = date(2026, 1, 28)  # the worst January day at the 09:20 gate
OUT = Path(__file__).resolve().parent.parent / "web" / "prerender-data.json"


def _json(model: type[BaseModel], data: dict) -> dict:
    return model.model_validate(data).model_dump(mode="json", exclude_none=True)


def opening_view() -> dict:
    async def collect() -> dict:
        return {
            "meta": _json(models.Meta, await main.meta()),
            "decision": _json(models.Decision, await main.decision(OPENING_DAY, DEFAULT_GATE)),
            "accuracy": _json(models.Accuracy, await main.accuracy(DEFAULT_GATE)),
            "trackRecord": _json(models.TrackRecord, await main.track_record()),
        }

    return asyncio.run(collect())


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT
    out.write_text(json.dumps(opening_view()), encoding="utf-8")
    print(f"wrote {out}")
