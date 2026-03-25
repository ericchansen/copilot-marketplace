"""Step: Link repo skills into ~/.copilot/skills/."""

from __future__ import annotations

from copilot_setup.models import SetupContext, StepResult
from copilot_setup.ui_shim import UIShim
from lib.skills import get_skill_folders, link_skills


class SkillsStep:
    """Discover and symlink repo skills into ``~/.copilot/skills/``."""

    name = "Skills · Link"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()
        shim = UIShim()
        shim_summary: dict = {
            "skills_created": [],
            "skills_existed": [],
            "skills_skipped": [],
            "skills_failed": [],
        }

        local_skills = get_skill_folders(ctx.repo_skills)
        ctx.local_skills = local_skills
        link_skills(shim, local_skills, ctx.copilot_skills, ctx.non_interactive, shim_summary)

        for name, status, detail in shim.items:
            result.item(name, status, detail)
        return result
