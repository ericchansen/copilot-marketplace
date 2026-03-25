"""Step: Remove stale/orphaned symlinks from ~/.copilot/skills/."""

from __future__ import annotations

from copilot_setup.models import SetupContext, StepResult
from copilot_setup.ui_shim import UIShim
from lib.skills import cleanup_stale


class StaleCleanupStep:
    """Remove broken or unmanaged skill symlinks."""

    name = "Cleanup · Stale Symlinks"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()
        shim = UIShim()
        shim_summary: dict = {}
        linked_names = {s["name"] for s in getattr(ctx, "local_skills", [])}
        auto_remove = ctx.include_clean_orphans or ctx.non_interactive
        cleanup_stale(
            shim,
            ctx.copilot_skills,
            linked_names,
            ctx.repo_root,
            ctx.external_dir,
            ctx.include_clean_orphans,
            auto_remove,
            shim_summary,
        )

        for name, status, detail in shim.items:
            result.item(name, status, detail)
        return result
