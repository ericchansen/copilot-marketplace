"""Step: Install and register Copilot CLI plugins."""

from __future__ import annotations

import json
from pathlib import Path

from copilot_setup.models import SetupContext, StepResult
from copilot_setup.ui_shim import UIShim
from lib.skills import install_plugins, link_local_plugins

PLUGINS = [
    {"name": "msx-mcp", "source": "mcaps-microsoft/MSX-MCP", "work": True, "localServerName": "msx-mcp"},
]


class PluginsStep:
    """Install Copilot CLI plugins and register local clones."""

    name = "Skills · Plugins"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()
        shim = UIShim()
        shim_summary: dict = {"plugins_installed": [], "plugins_skipped": [], "plugins_failed": []}

        plugins_to_install = [p for p in PLUGINS if not p.get("work") or ctx.include_work]

        try:
            raw = ctx.mcp_servers_json.read_text("utf-8") if ctx.mcp_servers_json.exists() else '{"servers": []}'
            mcp_data = json.loads(raw)
        except json.JSONDecodeError:
            mcp_data = {"servers": []}

        local_clone_map: dict[str, Path] = {}
        for plugin in plugins_to_install:
            local_name = plugin.get("localServerName")
            if not local_name:
                continue
            server_def = next((s for s in mcp_data.get("servers", []) if s["name"] == local_name), None)
            if not server_def:
                continue
            entry_point = server_def.get("entryPoint", "")
            for dp in server_def.get("defaultPaths", []):
                candidate = Path(dp).expanduser()
                if (
                    candidate.is_dir()
                    and (candidate / ".git").is_dir()
                    and (not entry_point or (candidate / entry_point).exists())
                ):
                    local_clone_map[plugin["name"]] = candidate
                    break

        install_plugins(shim, plugins_to_install, local_clone_map, shim_summary)

        if local_clone_map:
            link_local_plugins(shim, plugins_to_install, local_clone_map, ctx.config_json, shim_summary)

        ctx.local_clone_map = local_clone_map
        ctx.plugins_to_install = plugins_to_install
        ctx.plugin_server_names = {p["localServerName"] for p in plugins_to_install if p.get("localServerName")}

        for name, status, detail in shim.items:
            result.item(name, status, detail)
        return result
