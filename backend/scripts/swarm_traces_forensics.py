"""Forensics on a real swarm: who talked to whom, how information spread, and what a content-blind gateway sees.

Swarm Traces (swarmtraces.org): ~190k rows from a real swarm intrusion. Every row is a payload, the response it got,
or text recovered from it (`parent_id` links children to the payload). Identities and destinations are redacted to
stable placeholders ([REDACTED:runtime_identifier:000042], [REDACTED:destination:000002]), so a destination or an
identifier is the same thing everywhere it appears. The data has no timestamps; where order matters, row order is
used as a proxy (rows are numbered as the publishers reconstructed them), and that is stated as a limitation.

The analysis reads only those placeholders and parent links, like a gateway that sees destinations and callers but
not message content. Payload text is never executed.

1. Who talked to whom: identifiers and the destinations they sent to; identifiers linked when they share a
   destination; clusters of linked identifiers.
2. Spread: destinations first seen in a *response or recovered text* (something an agent learned) and later used as
   the target of a payload (the learned address passed on and used). Parent fan-out.
3. Gateway monitor: flag a payload when its destination has already been used by >= k distinct identifiers (shared
   drop point). Compared with SG-029 (reads content), in coverage of the attack rows, and how early (row order) each
   first flags the top shared destinations.

    python -I scripts/swarm_traces_forensics.py [redacted.jsonl.gz] [out.json]
"""
from __future__ import annotations

import gzip
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/, for SG-029 (works under python -I too)

ID = re.compile(r"REDACTED:(?:runtime_identifier|source_identifier):(\d+)")
DEST = re.compile(r"REDACTED:destination:(\d+)")
NONE = (None, "", "None")


def rows(path: Path):
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as f:
        for i, line in enumerate(f):
            r = json.loads(line)
            r["_i"] = i
            yield r


class Union:
    def __init__(self):
        self.p: dict[str, str] = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def join(self, a, b):
        self.p[self.find(a)] = self.find(b)


def analyse(path: Path, k: int = 3) -> dict:
    from app.modules.detection.covert import covert_signals

    callers_of = defaultdict(set)        # destination -> identifiers seen with it in payloads
    payload_dests = Counter()
    learned_at: dict[str, int] = {}      # destination -> row where it first appeared in a response / recovered text
    used_at: dict[str, int] = {}         # destination -> row where it was first a payload's target
    children = Counter()
    n_payload = n_rows = 0
    gate_flag = sg029_flag = both = 0
    gate_first: dict[str, int] = {}      # destination -> row where the gateway first flagged it
    sg029_first: dict[str, int] = {}
    ids_seen = set()
    for r in rows(path):
        n_rows += 1
        text = r.get("text") or ""
        dests, ids = set(DEST.findall(text)), set(ID.findall(text))
        if r.get("parent_id") not in NONE:
            children[r["parent_id"]] += 1
        if r["kind"] != "payload":
            for d in dests:
                learned_at.setdefault(d, r["_i"])
            continue
        n_payload += 1
        ids_seen |= ids
        payload_dests.update(dests)
        g = False
        for d in dests:
            used_at.setdefault(d, r["_i"])
            if len(callers_of[d]) >= k:  # this destination is already a shared drop point
                g = True
                gate_first.setdefault(d, r["_i"])
            callers_of[d] |= ids
        sig = covert_signals(text)
        s = len(sig) >= 2 or "credential_out" in sig
        if s:
            for d in dests:
                sg029_first.setdefault(d, r["_i"])
        gate_flag += g
        sg029_flag += s
        both += g and s

    # who talked to whom: identifiers linked through shared destinations
    u = Union()
    for d, callers in callers_of.items():
        cs = sorted(callers)
        for c in cs[1:]:
            u.join(cs[0], c)
    clusters = Counter(u.find(i) for i in ids_seen)
    sizes = sorted(clusters.values(), reverse=True)
    shared = sorted(((len(c), d) for d, c in callers_of.items() if len(c) >= 2), reverse=True)
    passed_on = [d for d, t in learned_at.items() if d in used_at and used_at[d] > t]
    top = [d for _, d in shared[:20]]

    def earliest(first: dict) -> dict:
        hits = [first[d] for d in top if d in first]
        return {"top_shared_destinations_flagged": f"{len(hits)}/{len(top)}",
                "median_row_of_first_flag": sorted(hits)[len(hits) // 2] if hits else None}

    fan = sorted(children.values(), reverse=True)
    return {
        "rows": n_rows, "payloads": n_payload,
        "who_talked_to_whom": {
            "identifiers": len(ids_seen), "destinations": len(callers_of),
            "destinations_shared_by_2plus_identifiers": len(shared),
            "largest_shared_destination_identifiers": [n for n, _ in shared[:5]],
            "identifier_clusters": len(sizes), "largest_clusters": sizes[:5],
            "identifiers_in_largest_cluster_share": round(sizes[0] / len(ids_seen), 3) if sizes else 0.0,
        },
        "spread": {
            "payloads_with_children": len(children), "max_children_of_one_payload": fan[0] if fan else 0,
            "destinations_learned_then_used": len(passed_on),
            "share_of_used_destinations_learned_first": round(len(passed_on) / len(used_at), 3) if used_at else 0.0,
        },
        "gateway_vs_content": {
            "k_distinct_identifiers": k,
            "gateway_flagged_payloads": gate_flag, "sg029_flagged_payloads": sg029_flag, "flagged_by_both": both,
            "flagged_by_either": gate_flag + sg029_flag - both,
            "coverage_gateway": round(gate_flag / n_payload, 3), "coverage_sg029": round(sg029_flag / n_payload, 3),
            "coverage_either": round((gate_flag + sg029_flag - both) / n_payload, 3),
            "earliness_gateway": earliest(gate_first), "earliness_sg029": earliest(sg029_first),
        },
        "limitations": [
            "No timestamps: earliness is by row order, which may not be chronological.",
            "Identifiers are the redaction's pseudonyms, not confirmed agent identities.",
            "All rows are attack data: coverage is measured, false-positive rate is not.",
        ],
    }


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "datasets/swarmtraces/redacted.jsonl.gz"
    report = analyse(src)
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
