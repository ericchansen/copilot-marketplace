"""Step: Detect git authentication methods."""

from __future__ import annotations

from copilot_setup.models import SetupContext, StepResult
from copilot_setup.ui_shim import UIShim
from lib.git_helpers import detect_git_auth


class GitAuthStep:
    """Run git auth detection (GH CLI, SSH) and populate ``ctx.auth_state``."""

    name = "Preflight · Git Authentication"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()
        shim = UIShim()

        auth_dict: dict = {
            "gh_available": False,
            "ssh_available": False,
            "prefer_ssh": False,
        }
        detect_git_auth(shim, auth_dict)

        ctx.auth_state.gh_available = auth_dict["gh_available"]
        ctx.auth_state.ssh_available = auth_dict["ssh_available"]
        ctx.auth_state.prefer_ssh = auth_dict["prefer_ssh"]

        for name, status, detail in shim.items:
            result.item(name, status, detail)
        return result
