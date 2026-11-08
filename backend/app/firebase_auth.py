"""Firebase sign-in (Google accounts) for the web app: verify the ID token the browser sends.

Turn it on with SWARMGUARD_FIREBASE_AUTH_PROJECT=<your Firebase project id>. The browser signs in with Firebase
Authentication and sends `Authorization: Bearer <Firebase ID token>`; this module checks the token the way Firebase
documents it (RS256 signature by one of Google's current signing certificates, audience = the project, issuer =
https://securetoken.google.com/<project>, not expired, issued in the past, a subject). No firebase-admin needed.

Optional:
    SWARMGUARD_ALLOWED_EMAILS  comma list of emails and/or @domains allowed to sign in (others are refused);
                               recommended, so strangers with a Google account can't use your Gemini quota
    SWARMGUARD_ADMIN_EMAILS    comma list of emails that get the admin role (everyone else: operator)
"""
from __future__ import annotations

import base64
import json
import os
import threading
import time
from typing import Any, Callable

CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_cache: dict[str, Any] = {"certs": {}, "until": 0.0}
_lock = threading.Lock()


def project() -> str | None:
    return os.getenv("SWARMGUARD_FIREBASE_AUTH_PROJECT") or None


def _fetch_certs() -> tuple[dict[str, str], float]:
    import httpx

    r = httpx.get(CERTS_URL, timeout=10)
    r.raise_for_status()
    max_age = 3600
    for part in r.headers.get("cache-control", "").split(","):
        if part.strip().startswith("max-age="):
            max_age = int(part.strip()[8:])
    return r.json(), time.time() + max_age


fetch_certs: Callable[[], tuple[dict[str, str], float]] = _fetch_certs  # swapped in tests


def _certs() -> dict[str, str]:
    with _lock:
        if time.time() >= _cache["until"]:
            _cache["certs"], _cache["until"] = fetch_certs()
        return _cache["certs"]


def _b64(part: str) -> bytes:
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def verify(token: str, project_id: str | None = None, now: float | None = None) -> dict[str, Any] | None:
    """The token's claims if it is a valid Firebase ID token for the project, else None. Never raises."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    project_id = project_id or project()
    if not project_id or not token or token.count(".") != 2:
        return None
    try:
        h64, p64, s64 = token.split(".")
        header, claims = json.loads(_b64(h64)), json.loads(_b64(p64))
        if header.get("alg") != "RS256" or not header.get("kid"):
            return None
        pem = _certs().get(header["kid"])
        if not pem:
            return None
        key = x509.load_pem_x509_certificate(pem.encode()).public_key()
        key.verify(_b64(s64), f"{h64}.{p64}".encode(), padding.PKCS1v15(), hashes.SHA256())
    except Exception:
        return None
    now = time.time() if now is None else now
    ok = (claims.get("aud") == project_id
          and claims.get("iss") == f"https://securetoken.google.com/{project_id}"
          and isinstance(claims.get("sub"), str) and claims["sub"]
          and float(claims.get("exp", 0)) > now
          and float(claims.get("iat", now + 1)) <= now + 60          # small clock skew allowed
          and float(claims.get("auth_time", 0)) <= now + 60)
    return claims if ok else None


def _list(var: str) -> list[str]:
    return [x.strip().lower() for x in os.getenv(var, "").split(",") if x.strip()]


def email_allowed(email: str | None) -> bool:
    allowed = _list("SWARMGUARD_ALLOWED_EMAILS")
    if not allowed:
        return True
    email = (email or "").lower()
    return any(email == a or (a.startswith("@") and email.endswith(a)) for a in allowed)


def role_for(email: str | None) -> str:
    return "admin" if (email or "").lower() in _list("SWARMGUARD_ADMIN_EMAILS") else "operator"
