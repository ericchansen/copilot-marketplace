"""Step: Backup ~/.copilot/ before making changes."""

from __future__ import annotations

from copilot_setup.models import SetupContext, StepResult
from copilot_setup.ui_shim import UIShim
from lib.backup import backup_copilot_home


class BackupStep:
    """Back up ``~/.copilot/`` config files and skills."""

    name = "Backup"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()
        shim = UIShim()
        shim_summary: dict = {"backed_up": False, "backup_dir": ""}
        backup_copilot_home(shim, ctx.copilot_home, shim_summary)

        for name, status, detail in shim.items:
            result.item(name, status, detail)
        return result
