import pytest
from fastapi.testclient import TestClient

from backend.main import app
from scripts import export_web_data


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_prerender_data_matches_what_the_api_serves_for_the_opening_view(client):
    data = export_web_data.opening_view()
    assert data["meta"] == client.get("/api/meta").json()
    assert data["decision"] == client.get("/api/decision", params={"day": "2026-01-28"}).json()
    assert data["accuracy"] == client.get("/api/accuracy").json()
    assert data["trackRecord"] == client.get("/api/track-record").json()
