"""User-directed runs: one task the planner splits, or per-agent instructions from the user."""
import pytest
from pydantic import ValidationError

from app.modules.simulator.engine import run_simulation
from app.schemas import ScenarioConfig


def _assignments(sim) -> dict[str, str]:
    roles = {a.agent_id: a.role for a in sim.agents}
    return {roles[e.target]: e.payload.get("content", "") for e in sim.events
            if e.event_type == "message" and e.action == "send" and e.payload.get("intent") == "assign_task"}


def test_user_instruction_replaces_the_planners_directive_for_that_role(tmp_path):
    sim = run_simulation(ScenarioConfig(
        scenario_id="user_directed", agent_count=5, persist=False, workspace_dir=str(tmp_path),
        user_task="Build a CSV summary tool",
        agent_instructions={"coder": "Write it with the csv module only, no pandas."}))
    got = _assignments(sim)
    assert got["coder"] == "Write it with the csv module only, no pandas."
    assert "Build a CSV summary tool" in got["researcher"]  # left to the planner
    start = next(e for e in sim.events if e.event_type == "task" and e.payload.get("phase") == "planning")
    assert start.payload["agent_instructions"] == {"coder": "Write it with the csv module only, no pandas."}


def test_instructions_alone_start_a_user_directed_run(tmp_path):
    sim = run_simulation(ScenarioConfig(
        scenario_id="normal_collaboration", agent_count=5, persist=False, workspace_dir=str(tmp_path),
        agent_instructions={"researcher": "Compare three CSV libraries.", "analyst": "Define the output columns."}))
    got = _assignments(sim)
    assert got["researcher"] == "Compare three CSV libraries." and got["analyst"] == "Define the output columns."


def test_bad_instructions_are_rejected():
    with pytest.raises(ValidationError):
        ScenarioConfig(scenario_id="user_directed", agent_instructions={"hacker": "x"})
    with pytest.raises(ValidationError):
        ScenarioConfig(scenario_id="user_directed", agent_instructions={"coder": "x" * 2001})
    assert ScenarioConfig(scenario_id="user_directed", agent_instructions={"coder": "  "}).agent_instructions == {}
