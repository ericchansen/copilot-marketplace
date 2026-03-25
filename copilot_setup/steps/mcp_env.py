"""Step: Check/prompt MCP environment variables."""

from __future__ import annotations

import os

from copilot_setup.models import SetupContext, StepResult


class McpEnvStep:
    """Verify required MCP server environment variables are set.

    In interactive mode, prompts the user to set missing variables for the
    current session.  In non-interactive mode, emits warnings only.
    """

    name = "MCP · Environment"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()
        for server in ctx.enabled_servers:
            for var in server.get("envVars", []):
                val = os.environ.get(var)
                if val:
                    result.item(var, "exists", "set ✓")
                elif not ctx.non_interactive and ctx.real_ui is not None:
                    ctx.real_ui.print_msg(
                        f"⚠ {var} (required by {server['name']}) is not set",
                        "warn",
                    )
                    user_val = ctx.real_ui.prompt(
                        f"Enter value for {var} (or Enter to skip)",
                        default="",
                    )
                    if user_val:
                        os.environ[var] = user_val
                        result.item(var, "success", "set for this session")
                    else:
                        result.item(var, "warn", f"skipped — {server['name']} may not work")
                else:
                    result.item(var, "warn", f"not set — {server['name']} may not work")
        return result
