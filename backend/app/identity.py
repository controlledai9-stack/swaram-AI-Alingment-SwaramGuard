"""Who is acting, and who owns which run (so each signed-in person sees only their own runs).

The auth middleware puts the signed-in user's id in `current_user` for the request; every run created during that
request (simulator, background live run, replay, ingest session, dataset import) records it as `Run.owner`. Runs
created with authentication off, and runs from before this existed, have no owner: only admins see them when auth
is on.
"""
from __future__ import annotations

from contextvars import ContextVar
from typing import Any

current_user: ContextVar[str | None] = ContextVar("swarmguard_user", default=None)
RUN_OWNERS: dict[str, str | None] = {}  # run_id -> owner, for runs still in flight (not yet saved) and as a cache


def owner_of(run_id: str, store: Any) -> str | None:
    if run_id in RUN_OWNERS:
        return RUN_OWNERS[run_id]
    doc = store.get("runs", run_id)
    owner = (doc or {}).get("owner")
    if doc is not None:
        RUN_OWNERS[run_id] = owner
    return owner


def can_see(principal: Any, run_id: str | None, store: Any) -> bool:
    """People signed in with Google see their own runs (admins see all). API keys are shared team or service keys
    whose roles promise "read everything", so they keep the team-wide view. Auth off: everything."""
    if principal is None or getattr(principal, "via", "api_key") != "firebase":
        return True
    if getattr(principal, "role", None) == "admin" or not run_id:
        return True
    return owner_of(run_id, store) == principal.name
