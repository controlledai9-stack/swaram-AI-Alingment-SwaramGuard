"""Several Gemini keys as one quota: rotation, skipping a rate-limited key, summed status, keys never exposed."""
import json

from app.adapters import gemini_adapter as ga

KEYS = ["key-aaaaaaaaaaaaaaaaaaaa", "key-bbbbbbbbbbbbbbbbbbbb", "key-cccccccccccccccccccc"]


def pool(tmp_path, budget=10):
    p = ga.GeminiKeyPool(KEYS, state_file=tmp_path / "q.json")
    for t in p.trackers:
        t.daily_budget, t.rpm_limit = budget, 100
    return p


def test_keys_come_from_both_variables_without_duplicates(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEYS", f"{KEYS[0]}, {KEYS[1]}\n{KEYS[2]}")
    monkeypatch.setenv("GEMINI_API_KEY", KEYS[0])
    assert ga.gemini_keys() == KEYS


def test_calls_rotate_across_keys_and_quota_adds_up(tmp_path):
    p = pool(tmp_path)
    used = []
    for _ in range(6):
        assert p.can_call()[0]
        used.append(p.current_key())
        p.record_call()
    assert sorted(used) == sorted(KEYS * 2)  # spread evenly
    st = p.status()
    assert st["daily_limit"] == 30 and st["calls_today"] == 6 and st["remaining_today"] == 24
    assert st["keys"] == 3 and st["keys_available"] == 3


def test_a_rate_limited_key_is_skipped_and_the_rest_keep_working(tmp_path):
    p = pool(tmp_path)
    assert p.can_call()[0]
    bad = p.current_key()
    p.record_429(daily=True)  # Google says this key's daily quota is spent
    assert p.switch_key() and p.current_key() != bad
    for _ in range(10):
        assert p.can_call()[0] and p.current_key() != bad
        p.record_call()
    assert p.status()["keys_available"] == 2


def test_all_keys_spent_blocks_with_a_clear_reason(tmp_path):
    p = pool(tmp_path, budget=1)
    for _ in range(3):
        assert p.can_call()[0]
        p.record_call()
    ok, reason = p.can_call()
    assert not ok and "all 3 Gemini keys" in reason
    assert p.status()["exhausted"] and p.status()["remaining_today"] == 0


def test_keys_never_appear_in_state_files_or_status(tmp_path):
    p = pool(tmp_path)
    p.can_call()
    p.record_call()
    text = json.dumps(p.status()) + "".join(f.read_text() for f in tmp_path.iterdir()) + "".join(
        f.name for f in tmp_path.iterdir())
    assert not any(k in text for k in KEYS)
    assert len(list(tmp_path.iterdir())) == 1  # one file per key that was used, named by fingerprint
