"""Step: Clone/build local MCP servers."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from copilot_setup.models import SetupContext, StepResult
from copilot_setup.ui_shim import UIShim
from lib.git_helpers import clone_or_pull


class McpBuildStep:
    """Clone or pull, then build, each local MCP server."""

    name = "MCP · Build Servers"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()

        enabled_categories = ["base"]
        if ctx.include_work:
            enabled_categories.extend(["powerbi", "work"])

        try:
            raw = ctx.mcp_servers_json.read_text("utf-8") if ctx.mcp_servers_json.exists() else '{"servers": []}'
            mcp_data = json.loads(raw)
        except json.JSONDecodeError:
            mcp_data = {"servers": []}

        ctx.enabled_servers = [s for s in mcp_data["servers"] if s.get("category", "base") in enabled_categories]

        # Compute plugin-managed names (needs enabled_servers + plugin_server_names from plugins step)
        plugin_server_names = getattr(ctx, "plugin_server_names", set())
        ctx.plugin_managed_names = {
            s["name"] for s in ctx.enabled_servers
            if s.get("pluginFallback") and s["name"] in plugin_server_names
        }

        local_clone_map: dict[str, Path] = getattr(ctx, "local_clone_map", {})

        # Load .mcp-paths.json
        mcp_paths_file = ctx.repo_root / ".mcp-paths.json"
        try:
            mcp_paths: dict = json.loads(mcp_paths_file.read_text("utf-8")) if mcp_paths_file.exists() else {}
        except json.JSONDecodeError:
            mcp_paths = {}

        auth_dict = {
            "gh_available": ctx.auth_state.gh_available,
            "ssh_available": ctx.auth_state.ssh_available,
            "prefer_ssh": ctx.auth_state.prefer_ssh,
        }

        abort_clones = False
        failed_servers: list[dict] = []

        for server in ctx.enabled_servers:
            if server.get("type") != "local":
                continue
            if abort_clones:
                break

            server_name = server["name"]

            # Plugin-managed server without local clone → plugin handles everything
            if server_name in ctx.plugin_managed_names and server_name not in local_clone_map:
                result.item(server_name, "info", "handled by plugin — skipping build")
                continue

            resolved_path = None
            stored = mcp_paths.get(server_name)
            if stored and Path(stored).exists():
                resolved_path = stored
                result.item(server_name, "info", f"using stored path: {resolved_path}")
            else:
                detected = None
                for dp in server.get("defaultPaths", []):
                    expanded = Path(os.path.expanduser(dp))
                    if expanded.exists():
                        detected = str(expanded.resolve())
                        break
                if not detected:
                    ext_path = ctx.external_dir / server.get("cloneDir", server["name"])
                    if ext_path.exists():
                        detected = str(ext_path.resolve())

                resolved_path = detected or str((ctx.external_dir / server.get("cloneDir", server["name"])).resolve())

            if not Path(resolved_path).exists():
                # Clone needed
                clone_shim = UIShim()

                clone_result, effective_path = clone_or_pull(
                    server.get("repo", ""),
                    resolved_path,
                    server_name,
                    auth_dict,
                    True,  # Force non-interactive when using UIShim
                    clone_shim,
                )
                for name, status, detail in clone_shim.items:
                    result.item(name, status, detail)

                resolved_path = effective_path
                if clone_result == "aborted":
                    abort_clones = True
                    break
                if clone_result in ("skipped", "clone-failed", "identity-check-failed"):
                    result.item(server_name, "failed", f"clone: {clone_result}")
                    continue

            mcp_paths[server_name] = resolved_path

            # Build
            if server.get("build"):
                result.item(server_name, "info", "building…")
                build_ok = True
                for cmd in server["build"]:
                    r = subprocess.run(
                        cmd, shell=True, cwd=resolved_path,
                        capture_output=True, text=True, encoding="utf-8", errors="replace",
                    )
                    if r.returncode != 0:
                        result.item(server_name, "failed", f"'{cmd}' failed (exit {r.returncode})")
                        build_ok = False
                        break
                if build_ok:
                    result.item(server_name, "success", "built")
                else:
                    failed_servers.append(server)

        # Remove failed builds
        for s in failed_servers:
            if s in ctx.enabled_servers:
                ctx.enabled_servers.remove(s)

        mcp_paths_file.write_text(json.dumps(mcp_paths, indent=2) + "\n", "utf-8")
        ctx.mcp_paths = mcp_paths

        if not any(s.get("type") == "local" for s in ctx.enabled_servers):
            result.item("Local MCP servers", "info", "none to build")

        return result
