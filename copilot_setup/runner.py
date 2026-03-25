"""Step runner — iterates steps, collects results, drives UI.

The runner is the *only* layer that calls ``ui.step()`` / ``ui.end_step()``.
Steps themselves return :class:`StepResult` and never touch the UI directly.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from copilot_setup.models import SetupContext, StepResult, Summary

# ---------------------------------------------------------------------------
# Step protocol — every step must implement this
# ---------------------------------------------------------------------------


@runtime_checkable
class Step(Protocol):
    """A single setup step.

    Attributes:
        name: Human-readable step name (matches STEP_NAMES entries).
    """

    name: str

    def check(self, ctx: SetupContext) -> bool:
        """Return True if this step should run, False to skip."""
        ...

    def run(self, ctx: SetupContext) -> StepResult:
        """Execute the step and return a structured result."""
        ...


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


def run_steps(steps: list[Step], ctx: SetupContext, ui) -> Summary:
    """Execute a sequence of steps, rendering progress via *ui*.

    Each step is checked with :meth:`Step.check` first.  If it returns
    ``False`` the step is recorded as skipped.  Otherwise :meth:`Step.run`
    is called and the result is rendered.

    Returns a :class:`Summary` with every step's outcome.
    """
    # Give steps access to the real UI for interactive delegation
    ctx.real_ui = ui

    summary = Summary()

    for step in steps:
        if not step.check(ctx):
            ui.step(step.name)
            summary.record(step.name, StepResult(status="skipped"))
            ui.end_step()
            continue

        ui.step(step.name)

        try:
            result = step.run(ctx)

            # Render items through existing UI
            for item in result.items:
                ui.item(item.name, item.status, item.detail)

            summary.record(step.name, result)
        except Exception:
            failure_result = StepResult(status="failed")
            summary.record(step.name, failure_result)
            raise
        finally:
            ui.end_step()

    return summary
