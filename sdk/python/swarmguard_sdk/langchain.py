"""LangChain integration: every tool call an agent makes is gated and reported, tool output is scanned.

    from swarmguard_sdk.langchain import SwarmGuardCallbackHandler

    handler = SwarmGuardCallbackHandler(session, agent_id="a1", untrusted_tools={"web_search", "read_email"})
    agent_executor.invoke({"input": "..."}, config={"callbacks": [handler]})

- on_tool_start asks the gate; if SwarmGuard says no, it raises `Blocked` and the tool never runs
  (`raise_error = True` makes LangChain propagate it).
- on_tool_end reports the call; output of tools in `untrusted_tools` is sent as untrusted content, so SwarmGuard's
  prompt-injection classifier (SG-028) scores it and the hijack tripwire arms.
- on_tool_error reports the failure.
Works with langchain-core's BaseCallbackHandler when installed; the handler itself only needs the SDK.
"""
from __future__ import annotations

import ast
import json
import re
from typing import Any

from swarmguard_sdk import Blocked, Session

try:  # inherit LangChain's base class when available (it is duck-typed either way)
    from langchain_core.callbacks import BaseCallbackHandler as _Base
except Exception:  # pragma: no cover - langchain not installed
    _Base = object


class SwarmGuardCallbackHandler(_Base):
    raise_error = True  # LangChain re-raises exceptions from this handler: a Blocked tool call stops

    def __init__(self, session: Session, agent_id: str, untrusted_tools: set[str] | None = None, block: bool = True):
        self.session, self.agent_id, self.block = session, agent_id, block
        self.untrusted_tools = set(untrusted_tools or ())
        self._running: dict[Any, str] = {}

    @staticmethod
    def _tool(serialized: dict | None, kw: dict) -> str:
        return str((serialized or {}).get("name") or kw.get("name") or "tool")

    def on_tool_start(self, serialized: dict, input_str: str, *, run_id=None, inputs: dict | None = None,
                      **kw: Any) -> None:
        name = self._tool(serialized, kw)
        call = describe_call(name, inputs if isinstance(inputs, dict) else _parse_args(input_str))
        self._running[run_id] = (name, call)
        d = self.session.gate(self.agent_id, call["event_type"], call["action"], resource=call["resource"],
                              target=call["target"], payload={**call["payload"], "input": str(input_str)[:2000]})
        if not d.allow and self.block:
            self.session.report(self.agent_id, call["event_type"], call["action"], resource=call["resource"],
                                target=call["target"], status="denied",
                                payload={**call["payload"], "gateway_reason": d.reason})
            raise Blocked(self.agent_id, d.reason)

    def _pop(self, run_id, kw: dict) -> tuple[str, dict]:
        name, call = self._running.pop(run_id, (None, None))
        name = name or self._tool(None, kw)
        return name, call or describe_call(name, {})

    def on_tool_end(self, output: Any, *, run_id=None, **kw: Any) -> None:
        name, call = self._pop(run_id, kw)
        text = str(getattr(output, "content", output))
        untrusted = name in self.untrusted_tools
        self.session.report(self.agent_id, call["event_type"], call["action"], resource=call["resource"],
                            target=call["target"], payload=call["payload"],
                            content=text[:4000] if untrusted else None, untrusted=untrusted)

    def on_tool_error(self, error: BaseException, *, run_id=None, **kw: Any) -> None:
        name, call = self._pop(run_id, kw)
        if not isinstance(error, Blocked):
            self.session.report(self.agent_id, call["event_type"], call["action"], resource=call["resource"],
                                target=call["target"], status="failed",
                                payload={**call["payload"], "error": str(error)[:300]})


# What a tool call does, from its arguments, so the gate can check it (same mapping as the backend's MCP gateway):
# a destination that is a URL or "external:..." makes it an upload to that host; a named resource makes it an access
# to that resource; anything else is a plain tool run.
RESOURCE_KEYS = ("resource", "path", "file", "table", "dataset", "uri")
DEST_KEYS = ("destination", "url", "endpoint", "to", "target")
_WRITE_TOOL = re.compile(r"write|update|create|delete|put|save|edit|append", re.I)


def _parse_args(input_str: Any) -> dict:
    """LangChain passes `inputs` (a dict) to newer handlers; older ones only get a string (JSON or a Python repr)."""
    if isinstance(input_str, dict):
        return input_str
    s = str(input_str or "").strip()
    for parse in (json.loads, ast.literal_eval):
        try:
            v = parse(s)
            if isinstance(v, dict):
                return v
        except (ValueError, SyntaxError, TypeError, MemoryError, RecursionError):
            pass
    return {}


def _pick(args: dict, keys: tuple[str, ...]) -> str | None:
    for k in keys:
        v = args.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def describe_call(name: str, args: dict) -> dict:
    resource, dest = _pick(args, RESOURCE_KEYS), _pick(args, DEST_KEYS)
    if dest and (dest.startswith(("http://", "https://")) or dest.startswith("external:")):
        host = dest.split("://", 1)[-1].split("/", 1)[0] if "://" in dest else dest.removeprefix("external:")
        return {"event_type": "data_transfer", "action": "upload", "resource": resource, "target": f"external:{host}",
                "payload": {"tool": name}}
    if resource:
        return {"event_type": "resource_access", "action": "write" if _WRITE_TOOL.search(name) else "read",
                "resource": resource, "target": None, "payload": {"tool": name}}
    return {"event_type": "tool_call", "action": "run", "resource": f"tool/{name}", "target": None,
            "payload": {"tool": name}}
