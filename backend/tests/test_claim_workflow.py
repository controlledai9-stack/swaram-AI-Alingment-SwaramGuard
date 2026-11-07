"""'Did it actually happen?': false "done" claims in a 3-worker SQLite workflow, log check (SG-030) vs state check."""
import pytest

from app.services.claim_workflow import FAULTS, WORKERS, evaluate, trial


def test_honest_runs_raise_nothing_and_end_right():
    for seed in range(30):
        t = trial("none", seed)
        assert not (t.final_wrong or t.sg030_caught or t.state_caught)


@pytest.mark.parametrize("fault", [f for f in FAULTS if f != "none"])
@pytest.mark.parametrize("faulty", WORKERS)
def test_every_lie_corrupts_the_db_and_the_state_check_fixes_it(fault, faulty):
    t = trial(fault, 7, faulty)
    assert t.final_wrong                       # without a check the database ends wrong
    assert t.downstream_mistake == (faulty != WORKERS[-1])  # and a later worker is misled
    assert t.state_caught and t.state_in_time  # the independent check stops and repairs it


@pytest.mark.parametrize("fault,log_sees_it", [("phantom", True), ("false_success", True),
                                                ("wrong_value", False), ("spoofed_log", False)])
def test_a_log_check_misses_what_the_log_doesnt_show(fault, log_sees_it):
    assert trial(fault, 3, "billing").sg030_caught is log_sees_it


def test_evaluation_summary():
    r = evaluate(20)
    assert r["none"]["state_check_flagged"] == 0 and r["none"]["sg030_flagged"] == 0
    for f in FAULTS[1:]:
        assert r[f]["state_check_fixed_in_time"] == 1.0
        assert r[f]["later_worker_mistake_when_liar_upstream"] == 1.0
