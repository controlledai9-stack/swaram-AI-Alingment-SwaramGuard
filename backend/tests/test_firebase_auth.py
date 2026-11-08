"""Google sign-in through Firebase: token verification, allowlist/admin roles, and 'own runs only'."""
import base64
import json
import time

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID
from fastapi.testclient import TestClient

from app import firebase_auth
from app.identity import RUN_OWNERS
from app.main import app, get_pipeline
from app.services.pipeline import Pipeline
from app.storage.sqlite_store import SQLiteStore

PROJECT = "swarmguard-test"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _cert(key) -> str:
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "securetoken")])
    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(1).not_valid_before(now).not_valid_after(now.replace(year=now.year + 1))
            .sign(key, hashes.SHA256()))
    return cert.public_bytes(serialization.Encoding.PEM).decode()


def _b64(d) -> str:
    raw = d if isinstance(d, bytes) else json.dumps(d).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def token(email="ana@example.com", key=KEY, kid="k1", **over) -> str:
    now = int(time.time())
    claims = {"aud": PROJECT, "iss": f"https://securetoken.google.com/{PROJECT}", "sub": "uid-" + email,
              "iat": now - 10, "auth_time": now - 10, "exp": now + 3600, "email": email, "email_verified": True,
              "name": email.split("@")[0].title(), **over}
    head = _b64({"alg": "RS256", "kid": kid, "typ": "JWT"})
    body = _b64(claims)
    sig = key.sign(f"{head}.{body}".encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{head}.{body}.{_b64(sig)}"


def H(email="ana@example.com"):
    return {"Authorization": f"Bearer {token(email)}"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SWARMGUARD_FIREBASE_AUTH_PROJECT", PROJECT)
    monkeypatch.delenv("SWARMGUARD_API_KEYS", raising=False)
    monkeypatch.setenv("SWARMGUARD_ADMIN_EMAILS", "boss@example.com")
    monkeypatch.setattr(firebase_auth, "fetch_certs", lambda: ({"k1": _cert(KEY)}, time.time() + 3600))
    monkeypatch.setitem(firebase_auth._cache, "until", 0.0)
    p = Pipeline(SQLiteStore(str(tmp_path / "t.db")))
    app.dependency_overrides[get_pipeline] = lambda: p
    RUN_OWNERS.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()
    RUN_OWNERS.clear()


# ------------------------------------------------------------ token checks
def test_valid_token_signs_in(client):
    me = client.get("/api/whoami", headers=H()).json()
    assert me["auth"] and me["name"] == "ana@example.com" and me["role"] == "operator" and me["via"] == "firebase"
    assert client.get("/api/whoami", headers=H("boss@example.com")).json()["role"] == "admin"


@pytest.mark.parametrize("bad", [
    dict(aud="other-project"), dict(iss="https://securetoken.google.com/other"), dict(exp=int(time.time()) - 5),
    dict(sub=""), dict(email_verified=False),
])
def test_bad_tokens_are_refused(client, bad):
    assert client.get("/api/runs", headers={"Authorization": f"Bearer {token(**bad)}"}).status_code == 401


def test_forged_signature_and_unknown_key_are_refused(client):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert client.get("/api/runs", headers={"Authorization": f"Bearer {token(key=other)}"}).status_code == 401
    assert client.get("/api/runs", headers={"Authorization": f"Bearer {token(kid='nope')}"}).status_code == 401
    assert client.get("/api/runs").status_code == 401


def test_allowlist(client, monkeypatch):
    monkeypatch.setenv("SWARMGUARD_ALLOWED_EMAILS", "@team.example, solo@x.org")
    assert client.get("/api/runs", headers=H("dev@team.example")).status_code == 200
    assert client.get("/api/runs", headers=H("solo@x.org")).status_code == 200
    assert client.get("/api/runs", headers=H("stranger@gmail.com")).status_code == 401


# ------------------------------------------------------------ own runs only
def _run(client, email, name):
    r = client.post("/api/simulate", headers=H(email), json={"scenario_id": "normal_collaboration", "persist": True,
                                                              "run_name": name})
    assert r.status_code == 200, r.text
    return r.json()["run"]["run_id"]


def test_each_person_sees_only_their_own_runs(client):
    a = _run(client, "ana@example.com", "Ana's leak test")
    b = _run(client, "ben@example.com", "Ben's run")
    ana = client.get("/api/runs", headers=H("ana@example.com")).json()
    assert [(r["run_id"], r["name"], r["owner"]) for r in ana] == [(a, "Ana's leak test", "ana@example.com")]
    assert client.get(f"/api/runs/{b}", headers=H("ana@example.com")).status_code == 404
    assert client.get(f"/api/runs/{b}/alerts", headers=H("ana@example.com")).status_code == 404
    assert client.get(f"/api/runs/{a}/alerts", headers=H("ana@example.com")).status_code == 200
    assert {r["run_id"] for r in client.get("/api/runs", headers=H("boss@example.com")).json()} == {a, b}  # admin


def test_reviews_are_scoped_to_own_runs(client):
    a = _run(client, "ana@example.com", "a")
    from app.services import review

    store = app.dependency_overrides[get_pipeline]().store
    store.put("reviews", "rv-1", {"review_id": "rv-1", "run_id": a, "status": "pending", "agent_id": "x",
                                  "kind": "paused_agent", "created_at": "2026-11-08T00:00:00Z"})
    assert [i["review_id"] for i in client.get("/api/reviews", headers=H("ana@example.com")).json()] == ["rv-1"]
    assert client.get("/api/reviews", headers=H("ben@example.com")).json() == []
    assert client.post("/api/reviews/rv-1", headers=H("ben@example.com"), json={"decision": "release"}).status_code == 404
    assert review  # imported for the store shape


def test_background_run_keeps_its_owner_and_name(client):
    r = client.post("/api/runs/start", headers=H("ana@example.com"),
                    json={"scenario_id": "normal_collaboration", "persist": True, "run_name": "bg"})
    run_id = r.json()["run_id"]
    for _ in range(200):
        if client.get(f"/api/runs/{run_id}", headers=H("ana@example.com")).status_code == 200:
            break
        time.sleep(0.05)
    run = client.get(f"/api/runs/{run_id}", headers=H("ana@example.com")).json()
    assert run["owner"] == "ana@example.com" and run["name"] == "bg"
    assert client.get(f"/api/runs/{run_id}", headers=H("ben@example.com")).status_code == 404


def test_delete_run_removes_it_and_only_the_owner_can(client):
    a = _run(client, "ana@example.com", "to delete")
    assert client.delete(f"/api/runs/{a}", headers=H("ben@example.com")).status_code == 404  # not Ben's
    r = client.delete(f"/api/runs/{a}", headers=H("ana@example.com"))
    assert r.status_code == 200 and r.json()["deleted"]["runs"] == 1 and r.json()["deleted"]["raw_events"] > 0
    assert client.get(f"/api/runs/{a}", headers=H("ana@example.com")).status_code == 404
    assert client.get(f"/api/runs/{a}/alerts", headers=H("ana@example.com")).json() in ([], {"detail": f"run {a} not found"})
    assert client.get("/api/runs", headers=H("ana@example.com")).json() == []
