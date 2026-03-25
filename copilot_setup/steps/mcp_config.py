"""Step: Generate mcp-config.json."""

from __future__ import annotations

from copilot_setup.models import SetupContext, StepResult
from lib.config import generate_mcp_config


class McpConfigStep:
    """Generate ``~/.copilot/mcp-config.json`` from enabled servers."""

    name = "MCP · Config"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()
        mcp_config_path = ctx.copilot_home / "mcp-config.json"

        # Exclude plugin-managed servers — their plugin .mcp.json provides the config
        config_servers = [s for s in ctx.enabled_servers if s["name"] not in ctx.plugin_managed_names]
        generate_mcp_config(config_servers, ctx.mcp_paths, ctx.external_dir, mcp_config_path)

        result.item("mcp-config.json", "success", f"{len(config_servers)} servers")
        if ctx.plugin_managed_names:
            managed = ", ".join(sorted(ctx.plugin_managed_names))
            result.item("Plugin-managed", "info", f"{managed} (via plugin .mcp.json)")
        return result
