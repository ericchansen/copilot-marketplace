"""Tests for copilot_setup.runner — step protocol and execution."""

from __future__ import annotations

from copilot_setup.models import SetupContext, StepResult
from copilot_setup.runner import Step, run_steps


class FakeUI:
    """Minimal UI stub that records calls."""

    def __init__(self):
        self.steps_started: list[str] = []
        self.steps_ended: int = 0
        self.items: list[tuple[str, str, str]] = []

    def step(self, name: str) -> None:
        self.steps_started.append(name)

    def end_step(self) -> None:
        self.steps_ended += 1

    def item(self, name: str, status: str, detail: str = "") -> None:
        self.items.append((name, status, detail))


class AlwaysRunStep:
    """A step that always runs and records one item."""

    def __init__(self, name: str = "Test Step"):
        self.name = name

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()
        result.item("thing", "created", "done")
        return result


class NeverRunStep:
    """A step that never runs (check returns False)."""

    def __init__(self, name: str = "Skipped Step"):
        self.name = name

    def check(self, ctx: SetupContext) -> bool:
        return False

    def run(self, ctx: SetupContext) -> StepResult:
        raise AssertionError("run() should not be called when check() returns False")


class TestRunSteps:
    def test_runs_checked_steps(self, setup_ctx: SetupContext):
        ui = FakeUI()
        steps: list[Step] = [AlwaysRunStep("S1"), AlwaysRunStep("S2")]

        summary = run_steps(steps, setup_ctx, ui)

        assert len(summary.steps) == 2
        assert ui.steps_started == ["S1", "S2"]
        assert ui.steps_ended == 2
        assert len(ui.items) == 2

    def test_skips_unchecked_steps(self, setup_ctx: SetupContext):
        ui = FakeUI()
        steps: list[Step] = [NeverRunStep("Skip")]

        summary = run_steps(steps, setup_ctx, ui)

        assert summary.steps["Skip"].status == "skipped"
        # Skipped steps still advance the UI counter
        assert ui.steps_started == ["Skip"]
        assert ui.steps_ended == 1
        assert ui.items == []  # no items rendered for skipped steps

    def test_mixed_run_and_skip(self, setup_ctx: SetupContext):
        ui = FakeUI()
        steps: list[Step] = [
            AlwaysRunStep("A"),
            NeverRunStep("B"),
            AlwaysRunStep("C"),
        ]

        summary = run_steps(steps, setup_ctx, ui)

        assert summary.steps["A"].status == "ok"
        assert summary.steps["B"].status == "skipped"
        assert summary.steps["C"].status == "ok"
        assert ui.steps_started == ["A", "B", "C"]

    def test_protocol_check(self):
        assert isinstance(AlwaysRunStep(), Step)
        assert isinstance(NeverRunStep(), Step)

    def test_empty_steps(self, setup_ctx: SetupContext):
        ui = FakeUI()
        summary = run_steps([], setup_ctx, ui)
        assert len(summary.steps) == 0
        assert not summary.has_failures
