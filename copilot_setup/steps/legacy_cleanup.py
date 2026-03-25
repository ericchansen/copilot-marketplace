"""Step: Remove legacy plugin junctions from ~/.copilot/skills/."""

from __future__ import annotations

from copilot_setup.models import SetupContext, StepResult
from copilot_setup.ui_shim import UIShim
from lib.skills import legacy_cleanup

LEGACY_PATTERNS = ["anthropic-skills", "awesome-copilot", "SPT-IQ"]


class LegacyCleanupStep:
    """Remove legacy community-plugin junctions from ``~/.copilot/skills/``."""

    name = "Skills · Legacy Cleanup"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()
        shim = UIShim()
        shim_summary: dict = {"plugin_junctions_cleaned": 0}
        legacy_cleanup(shim, ctx.copilot_skills, ctx.repo_root, LEGACY_PATTERNS, shim_summary)

        for name, status, detail in shim.items:
            result.item(name, status, detail)
        return result
