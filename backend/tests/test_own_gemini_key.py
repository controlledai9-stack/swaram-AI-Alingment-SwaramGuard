"""A person's own Gemini key (X-Gemini-Key): used for their runs only, not stored, not counted in the shared quota."""
import pytest
from fastapi.testclient import TestClient

from app.adapters import gemini_adapter as ga
from app.adapters import get_adapter
from app.identity import gemini_key_from, user_gemini_key
from app.main import app, get_pipeline
from app.services import quota
from app.services.pipeline import Pipeline
from app.storage.sqlite_store import SQLiteStore

OWN = "own-key-0123456789abcdefghij"


@pytest.fixture()
def client(tmp_path):
    app.dependency_overrides[get_pipeline] = lambda: Pipeline(SQLiteStore(str(tmp_path / "t.db")))
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.mark.parametrize("value,ok", [(OWN, True), ("short", False), ("has space " * 3, False), ("", False)])
def test_header_validation(value, ok):
    assert (gemini_key_from({"x-gemini-key": value}) == OWN) is ok


def test_runs_in_the_request_use_the_own_key_with_a_private_counter():
    token = user_gemini_key.set(OWN)
    try:
        a = get_adapter("gemini")
    finally:
        user_gemini_key.reset(token)
    assert a.api_key == OWN and a._explicit_key == OWN  # never rotated into the shared pool
    assert a.quota_tracker is not ga.GLOBAL_QUOTA_TRACKER


def test_own_key_skips_the_shared_quota_check(monkeypatch, tmp_path):
    spent = ga.GeminiQuotaTracker(480, 14, state_file=tmp_path / "q.json")
    spent.record_429(60.0, daily=True)
    monkeypatch.setattr(ga, "GLOBAL_QUOTA_TRACKER", spent)
    from app.schemas import ScenarioConfig

    cfg = ScenarioConfig(scenario_id="normal_collaboration", agent_backend="gemini")
    with pytest.raises(ValueError, match="Not enough Gemini quota"):
        quota.check_run(cfg)
    token = user_gemini_key.set(OWN)
    try:
        quota.check_run(cfg)  # their own key: Google enforces their quota, ours isn't touched
    finally:
        user_gemini_key.reset(token)


def test_quota_endpoint_says_when_the_own_key_is_used(client):
    assert client.get("/api/gemini/quota").json()["using_own_key"] is False
    assert client.get("/api/gemini/quota", headers={"X-Gemini-Key": OWN}).json()["using_own_key"] is True


def test_check_key_reports_success_or_googles_reason_without_the_key(client, monkeypatch):
    assert client.post("/api/gemini/check-key").status_code == 400
    monkeypatch.setattr(ga.GeminiAdapter, "generate_response", lambda self, *a, **k: "OK")
    assert client.post("/api/gemini/check-key", headers={"X-Gemini-Key": OWN}).json() == {"ok": True, "error": None}

    def boom(self, *a, **k):
        raise RuntimeError(f"API key not valid: {OWN}")

    monkeypatch.setattr(ga.GeminiAdapter, "generate_response", boom)
    r = client.post("/api/gemini/check-key", headers={"X-Gemini-Key": OWN}).json()
    assert r["ok"] is False and "not valid" in r["error"] and OWN not in r["error"]
