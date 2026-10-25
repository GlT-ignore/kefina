import json

import pytest
from fastapi.testclient import TestClient

from backend.config import DATA
from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health_reports_the_snapshot(client):
    body = client.get("/api/health").json()
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    assert body["status"] == "ok"
    assert body["snapshot_pulled_at"] == manifest["pulled_at"]
    assert body["january_hours"] == 744


def test_meta_lists_gates_window_and_attribution(client):
    body = client.get("/api/meta").json()
    assert [g["id"] for g in body["gates"]] == ["epex_0920", "n2ex_0950", "epex_1530"]
    assert body["default_gate"] == "epex_0920"
    assert (body["delivery_first"], body["delivery_last"]) == ("2026-01-02", "2026-02-01")
    assert "Elexon" in body["attribution"]
    assert (body["margin_window_days"], body["bias_window_days"]) == (28, 7)


def test_decision_defaults_to_the_0920_gate(client):
    body = client.get("/api/decision", params={"day": "2026-01-28"}).json()
    assert body["gate"] == "epex_0920"
    assert body["runs_used"] == [{"publish_time": "2026-01-27T07:30:00Z", "hours": 24}]
    assert body["hours"][0]["margin_mw"] > 0


@pytest.mark.parametrize(
    "params", [{"day": "2026-01-28", "gate": "nope"}, {"day": "2026-02-02"}, {"day": "2026-01-01"}]
)
def test_decision_rejects_unknown_gates_and_days_outside_january_decisions(client, params):
    assert client.get("/api/decision", params=params).status_code == 422


@pytest.mark.parametrize("gate", ["epex_0920", "n2ex_0950", "epex_1530"])
def test_accuracy_for_every_gate(client, gate):
    body = client.get("/api/accuracy", params={"gate": gate}).json()
    assert body["headline"]["n"] == 744


def test_track_record_carries_the_calibration_that_chose_the_windows(client):
    body = client.get("/api/track-record").json()
    assert body["calibration"]["margin_days"] == 28
    assert [r["rule"] for r in body["january"]] == ["raw", "bias", "margin"]
