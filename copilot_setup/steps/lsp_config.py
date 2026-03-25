"""Step: Generate lsp-config.json."""

from __future__ import annotations

from copilot_setup.models import SetupContext, StepResult
from copilot_setup.ui_shim import UIShim
from lib.config import generate_lsp_config


class LspConfigStep:
    """Validate LSP server binaries and generate ``~/.copilot/lsp-config.json``."""

    name = "LSP · Config"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()
        shim = UIShim()
        lsp_config_path = ctx.copilot_home / "lsp-config.json"
        generate_lsp_config(ctx.lsp_servers_json, lsp_config_path, shim)

        for name, status, detail in shim.items:
            result.item(name, status, detail)
        return result
