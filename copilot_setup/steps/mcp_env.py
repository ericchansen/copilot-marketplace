"""Step: Check/prompt MCP environment variables."""

from __future__ import annotations

import os

from copilot_setup.models import SetupContext, StepResult


class McpEnvStep:
    """Verify required MCP server environment variables are set."""

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
                else:
                    result.item(var, "warn", f"not set — {server['name']} may not work")
        return result
