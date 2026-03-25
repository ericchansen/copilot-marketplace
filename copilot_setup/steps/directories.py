"""Step: Ensure required directories exist."""

from __future__ import annotations

from copilot_setup.models import SetupContext, StepResult
from lib.platform_ops import ensure_dir


class DirectoriesStep:
    """Ensure ``~/.copilot/`` and ``~/.copilot/skills/`` exist."""

    name = "Setup · Directories"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()
        ensure_dir(ctx.copilot_home)
        ensure_dir(ctx.copilot_skills)
        result.item("~/.copilot/ and ~/.copilot/skills/", "success", "exist")
        return result
