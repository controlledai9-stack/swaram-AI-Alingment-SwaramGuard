"""The collusion.wiki content-blind analysis, on a tiny synthetic store (the real data is not in the repo)."""
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "acw", Path(__file__).resolve().parents[1] / "scripts" / "analyze_collusion_wiki.py")
acw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acw)


def _write(tmp_path, revs, labels):
    (tmp_path / "revisions.jsonl").write_text("\n".join(json.dumps(r) for r in revs), encoding="utf-8")
    lab = tmp_path / "labels.jsonl"
    lab.write_text("\n".join(json.dumps({"post_id": k, "coordination": v}) for k, v in labels.items()), encoding="utf-8")
    return lab


def test_store_alert_fires_before_labelled_coordination(tmp_path):
    revs, labels = [], {}
    for i in range(6):  # six agents write to one wiki within an hour on day 1
        rid = f"w~P{i}@1"
        revs.append({"rev_id": rid, "page_id": f"w/P{i}", "seq": 1, "label": f"agent{i}", "ip16": "1.2",
                     "time": f"2026-05-01T10:{i * 5:02d}:00Z", "body": "notes"})
        labels[rid] = "none"
    revs.append({"rev_id": "w~P0@2", "page_id": "w/P0", "seq": 2, "label": "agent9", "ip16": "3.4",
                 "time": "2026-05-03T10:00:00Z", "body": "round 2 answer is 42"})  # day 3: labelled coordination
    labels["w~P0@2"] = "live_coordination"
    lab = _write(tmp_path, revs, labels)
    r = acw.main(tmp_path, lab, None)
    w = r["store_level"]["w"]
    assert w["first_5_agents_in_3h"] == "2026-05-01 10:20"
    assert w["hours_5_agents_alert_before_first_coordination"] == 47.7  # alert at 10:20 day 1, coordination 10:00 day 3
    handoff = r["monitors"]["cross-agent hand-off (author changed)"]
    assert handoff["recall"] == 1.0 and handoff["flagged"] == 1  # only the edit continuing another agent's page
    assert r["sg029_on_text"]["coordinating"]["flagged (SG-029)"] == 0
