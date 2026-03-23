#!/usr/bin/env python3
"""
Copilot CLI configuration, skills, and MCP/LSP server setup.

Replaces the parallel setup.ps1 / setup.sh scripts with a single cross-platform
Python implementation.  Idempotent — safe to re-run at any time.

Usage:
    python setup.py               # interactive mode
    python setup.py --work        # include work tools (MSX-MCP, Power BI)
    python setup.py --non-interactive
    python setup.py --clean-orphans
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Ensure UTF-8 output on Windows (avoids cp1252 UnicodeEncodeError with box-drawing chars)
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# Ensure lib/ is importable when running from repo root
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(REPO_ROOT))

from lib.ui import UI
from lib.platform_ops import (
    home_dir,
    create_dir_link,
    create_file_link,
    is_link,
    get_link_target,
    remove_link,
    ensure_dir,
)
from lib.config import patch_config_json, generate_mcp_config, generate_lsp_config
from lib.git_helpers import detect_git_auth, clone_or_pull
from lib.skills import (
    get_skill_folders,
    link_skills,
    legacy_cleanup,
    install_plugins,
    update_plugins,
    cleanup_stale,
)
from lib.backup import backup_copilot_home
from lib.optional_deps import run_optional_deps

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
COPILOT_DIR = ".copilot"
SKILLS_DIR = "skills"

CONFIG_FILE_LINKS = [
    {"name": "copilot-instructions.md"},
]

PORTABLE_ALLOWED_KEYS = [
    "banner", "model", "render_markdown", "theme", "experimental", "reasoning_effort",
]

PLUGINS = [
    {"name": "msx-mcp", "source": "mcaps-microsoft/MSX-MCP", "work": True},
]

STEP_NAMES = [
    "Preflight · Git Authentication",
    "Backup",
    "Setup · Directories",
    "Setup · Config Symlinks",
    "Setup · Patch config.json",
    "Setup · Trusted Folders",
    "Skills · Link",
    "Skills · Legacy Cleanup",
    "Skills · Plugins",
    "Plugins · Update",
    "MCP · Build Servers",
    "MCP · Environment",
    "MCP · Config",
    "LSP · Config",
    "Cleanup · Stale Symlinks",
]

LEGACY_PATTERNS = ["anthropic-skills", "awesome-copilot", "msx-mcp", "MSX-MCP", "SPT-IQ"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Copilot CLI setup, backup, restore, and skill sync",
        usage="%(prog)s [command] [options]",
    )
    sub = p.add_subparsers(dest="command")

    # Default (no subcommand) = setup, but also register it explicitly
    setup_p = sub.add_parser("setup", help="Run full setup (default)")
    setup_p.add_argument("--work", action="store_true", help="Include work tools (MSX-MCP, Power BI)")
    setup_p.add_argument("--non-interactive", action="store_true", help="Run without prompts")
    setup_p.add_argument("--clean-orphans", action="store_true", help="Remove skills not managed by this repo")

    backup_p = sub.add_parser("backup", help="Back up personalization files to OneDrive")
    backup_p.add_argument("--skip-session", action="store_true", help="Skip session-store.db (faster)")

    restore_p = sub.add_parser("restore", help="Remove setup symlinks, optionally restore from backup")
    restore_p.add_argument("--non-interactive", action="store_true", help="Skip restore prompts")

    sync_p = sub.add_parser("sync-skills", help="Adopt untracked skills from ~/.copilot/skills/")
    sync_p.add_argument("--non-interactive", action="store_true", help="Skip per-skill prompts")

    # Allow top-level flags for backward compat (no subcommand = setup)
    p.add_argument("--work", action="store_true", help=argparse.SUPPRESS)
    p.add_argument("--non-interactive", action="store_true", help=argparse.SUPPRESS)
    p.add_argument("--clean-orphans", action="store_true", help=argparse.SUPPRESS)
    p.add_argument("--skip-session", action="store_true", help=argparse.SUPPRESS)

    return p.parse_args()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    args = parse_args()
    cmd = args.command or "setup"

    if cmd == "backup":
        from lib.backup import onedrive_backup
        ui = UI(["Backup · Config Files", "Backup · Session Store"])
        ui.header("💾  Copilot Config Backup")
        onedrive_backup(ui, skip_session=args.skip_session)
        return

    if cmd == "restore":
        from lib.restore import run_restore
        ui = UI(["Scan Symlinks", "Restore from Backup"])
        ui.header("🔄  Copilot Config Restore")
        run_restore(ui, REPO_ROOT, non_interactive=args.non_interactive)
        return

    if cmd == "sync-skills":
        from lib.skills import sync_untracked_skills
        repo_skills = REPO_ROOT / COPILOT_DIR / SKILLS_DIR
        copilot_skills = home_dir() / ".copilot" / "skills"
        ui = UI(["Scan Skills", "Adopt Skills"])
        ui.header("🔍  Sync Untracked Skills")
        sync_untracked_skills(ui, repo_skills, copilot_skills, non_interactive=args.non_interactive)
        return

    # Default: full setup
    _run_setup(args)
def _run_setup(args: argparse.Namespace) -> None:
    """Run the full setup flow."""
    ui = UI(STEP_NAMES)

    # Derived paths
    repo_copilot = REPO_ROOT / COPILOT_DIR
    repo_skills = repo_copilot / SKILLS_DIR
    external_dir = REPO_ROOT / "external"
    copilot_home = home_dir() / ".copilot"
    copilot_skills = copilot_home / "skills"
    config_json_path = copilot_home / "config.json"
    portable_json_path = repo_copilot / "config.portable.json"
    mcp_servers_json = REPO_ROOT / "mcp-servers.json"
    lsp_servers_json = REPO_ROOT / "lsp-servers.json"

    # Summary data (populated by each step)
    summary: dict = {
        "backed_up": False,
        "backup_dir": "",
        "config_files_linked": [],
        "config_files_skipped": [],
        "config_patched": False,
        "trusted_folder_added": False,
        "skills_created": [],
        "skills_existed": [],
        "skills_skipped": [],
        "skills_failed": [],
        "mcp_servers_built": [],
        "mcp_servers_failed": [],
        "mcp_env_missing": [],
        "mcp_config_generated": False,
        "mcp_server_count": 0,
        "lsp_config_generated": False,
        "lsp_count": 0,
        "lsp_skipped": [],
        "plugin_junctions_cleaned": 0,
        "plugins_installed": [],
        "plugins_skipped": [],
        "plugins_failed": [],
        "plugins_updated": [],
        "plugins_update_skipped": [],
        "plugins_update_failed": [],
        "optional_installed": [],
        "optional_skipped": [],
        "optional_failed": [],
    }

    # Git auth state
    auth_state: dict = {"gh_available": False, "ssh_available": False, "prefer_ssh": False}

    ui.header("📦  Copilot Config & Skills Setup")

    # -- Interactive pre-flight prompts ------------------------------------
    include_work = args.work
    include_clean_orphans = args.clean_orphans

    if not args.non_interactive:
        if not include_work:
            include_work = ui.confirm("Include work tools? (MSX-MCP plugin + Power BI MCP)")
        if not include_clean_orphans:
            include_clean_orphans = ui.confirm("Remove skills not managed by this repo?")

    # ── Step 1: Preflight · Git Authentication ────────────────────────────
    ui.step("Preflight · Git Authentication")
    detect_git_auth(ui, auth_state)
    ui.end_step()

    # ── Step 2: Backup ────────────────────────────────────────────────────
    ui.step("Backup")
    backup_copilot_home(ui, copilot_home, summary)
    ui.end_step()

    # ── Step 3: Setup · Directories ──────────────────────────────────────
    ui.step("Setup · Directories")
    ensure_dir(copilot_home)
    ensure_dir(copilot_skills)
    ui.item("~/.copilot/ and ~/.copilot/skills/", "success", "exist")
    ui.end_step()

    # ── Step 4: Setup · Config Symlinks ──────────────────────────────────
    ui.step("Setup · Config Symlinks")
    for cfg in CONFIG_FILE_LINKS:
        source_name = cfg.get("target", cfg["name"])
        target_path = repo_copilot / source_name
        link_path = copilot_home / cfg["name"]

        if not target_path.exists():
            ui.item(cfg["name"], "warn", "source not found in repo")
            continue

        result = create_file_link(link_path, target_path, not args.non_interactive)
        if result == "created":
            ui.item(cfg["name"], "created", "linked")
            summary["config_files_linked"].append(cfg["name"])
        elif result == "copied":
            ui.item(cfg["name"], "warn", "copied (symlinks need Developer Mode)")
            summary["config_files_linked"].append(cfg["name"])
        elif result == "exists":
            ui.item(cfg["name"], "exists", "already linked")
        elif result == "skipped":
            ui.item(cfg["name"], "skipped", "user declined")
            summary["config_files_skipped"].append(cfg["name"])
        else:
            ui.item(cfg["name"], "failed", "could not create symlink")
    ui.end_step()

    # ── Step 5: Setup · Patch config.json ────────────────────────────────
    ui.step("Setup · Patch config.json")
    patched = patch_config_json(config_json_path, portable_json_path, PORTABLE_ALLOWED_KEYS)
    if patched:
        ui.item("config.json", "success", "patched with portable settings")
        summary["config_patched"] = True
    else:
        ui.item("config.portable.json", "warn", "not found — skipping patch")
    ui.end_step()

    # ── Step 6: Setup · Trusted Folders ──────────────────────────────────
    ui.step("Setup · Trusted Folders")
    try:
        config_obj = json.loads(config_json_path.read_text("utf-8")) if config_json_path.exists() else {}
    except json.JSONDecodeError:
        ui.item("config.json", "warn", "invalid JSON — treating as empty")
        config_obj = {}
    trusted = config_obj.get("trusted_folders", [])
    resolved_root = str(REPO_ROOT.resolve())
    already_trusted = any(str(Path(f).resolve()) == resolved_root for f in trusted)
    if not already_trusted:
        trusted.append(resolved_root)
        config_obj["trusted_folders"] = trusted
        config_json_path.write_text(json.dumps(config_obj, indent=2) + "\n", "utf-8")
        ui.item(resolved_root, "created", "added to trusted_folders")
        summary["trusted_folder_added"] = True
    else:
        ui.item("Repo", "exists", "already in trusted_folders")
    ui.end_step()

    # ── Step 7: Skills · Link ────────────────────────────────────────────
    ui.step("Skills · Link")
    local_skills = get_skill_folders(repo_skills)
    link_skills(ui, local_skills, copilot_skills, args.non_interactive, summary)
    ui.end_step()

    # ── Step 8: Skills · Legacy Cleanup ──────────────────────────────────
    ui.step("Skills · Legacy Cleanup")
    legacy_cleanup(ui, copilot_skills, REPO_ROOT, LEGACY_PATTERNS, summary)
    ui.end_step()

    # ── Step 9: Skills · Plugins ─────────────────────────────────────────
    ui.step("Skills · Plugins")
    plugins_to_install = [p for p in PLUGINS if not p.get("work") or include_work]
    install_plugins(ui, plugins_to_install, summary)
    ui.end_step()

    # ── Step 10: Plugins · Update ────────────────────────────────────────
    ui.step("Plugins · Update")
    update_plugins(ui, summary)
    ui.end_step()

    # ── Step 11: MCP · Build Servers ─────────────────────────────────────
    ui.step("MCP · Build Servers")
    enabled_categories = ["base"]
    if include_work:
        enabled_categories.append("powerbi")
    mcp_data = json.loads(mcp_servers_json.read_text("utf-8")) if mcp_servers_json.exists() else {"servers": []}
    enabled_servers = [s for s in mcp_data["servers"] if s.get("category", "base") in enabled_categories]

    # Load .mcp-paths.json
    mcp_paths_file = REPO_ROOT / ".mcp-paths.json"
    mcp_paths: dict = json.loads(mcp_paths_file.read_text("utf-8")) if mcp_paths_file.exists() else {}

    abort_clones = False
    failed_servers: list[dict] = []
    for server in enabled_servers:
        if server.get("type") != "local":
            continue
        if abort_clones:
            break

        resolved_path = None
        stored = mcp_paths.get(server["name"])
        if stored and Path(stored).exists():
            resolved_path = stored
            ui.item(server["name"], "info", f"using stored path: {resolved_path}")
        else:
            # Auto-detect
            detected = None
            for dp in server.get("defaultPaths", []):
                expanded = Path(os.path.expanduser(dp))
                if expanded.exists():
                    detected = str(expanded.resolve())
                    break
            if not detected:
                ext_path = external_dir / server.get("cloneDir", server["name"])
                if ext_path.exists():
                    detected = str(ext_path.resolve())

            if not args.non_interactive:
                suggestion = detected or str((external_dir / server.get("cloneDir", server["name"])).resolve())
                user_input = ui.prompt(f"Path to {server['name']} repo", default=suggestion)
                resolved_path = str(Path(os.path.expanduser(user_input)).resolve()) if user_input else suggestion
            else:
                resolved_path = detected or str((external_dir / server.get("cloneDir", server["name"])).resolve())

        if not Path(resolved_path).exists():
            result, effective_path = clone_or_pull(
                server.get("repo", ""),
                resolved_path,
                server["name"],
                auth_state,
                args.non_interactive,
                ui,
            )
            resolved_path = effective_path  # may differ if user chose manual path
            if result == "aborted":
                abort_clones = True
                break
            if result in ("skipped", "clone-failed", "identity-check-failed"):
                summary["mcp_servers_failed"].append(server["name"])
                continue

        mcp_paths[server["name"]] = resolved_path

        # Build
        if server.get("build"):
            ui.item(server["name"], "info", "building…")
            build_ok = True
            for cmd in server["build"]:
                import subprocess
                r = subprocess.run(cmd, shell=True, cwd=resolved_path, capture_output=True, text=True)
                if r.returncode != 0:
                    ui.item(server["name"], "failed", f"'{cmd}' failed (exit {r.returncode})")
                    build_ok = False
                    break
            if build_ok:
                ui.item(server["name"], "success", "built")
                summary["mcp_servers_built"].append(server["name"])
            else:
                summary["mcp_servers_failed"].append(server["name"])
                failed_servers.append(server)

    # Remove failed builds after iteration completes (safe; avoids mutation during loop)
    for s in failed_servers:
        enabled_servers.remove(s)

    mcp_paths_file.write_text(json.dumps(mcp_paths, indent=2) + "\n", "utf-8")

    if not any(s.get("type") == "local" for s in enabled_servers):
        ui.item("Local MCP servers", "info", "none to build")
    ui.end_step()

    # ── Step 12: MCP · Environment ───────────────────────────────────────
    ui.step("MCP · Environment")
    for server in enabled_servers:
        for var in server.get("envVars", []):
            val = os.environ.get(var)
            if val:
                ui.item(var, "exists", "set ✓")
            elif not args.non_interactive:
                ui.print_msg(f"⚠ {var} (required by {server['name']}) is not set", "warn")
                user_val = ui.prompt(f"Enter value for {var} (or Enter to skip)", default="")
                if user_val:
                    os.environ[var] = user_val
                    ui.item(var, "success", "set for this session")
                else:
                    ui.item(var, "warn", f"skipped — {server['name']} may not work")
                    summary["mcp_env_missing"].append(f"{var} ({server['name']})")
            else:
                ui.item(var, "warn", f"not set — {server['name']} may not work")
                summary["mcp_env_missing"].append(f"{var} ({server['name']})")
    ui.end_step()

    # ── Step 13: MCP · Config ────────────────────────────────────────────
    ui.step("MCP · Config")
    mcp_config_path = copilot_home / "mcp-config.json"
    generate_mcp_config(enabled_servers, mcp_paths, external_dir, mcp_config_path)
    summary["mcp_config_generated"] = True
    summary["mcp_server_count"] = len(enabled_servers)
    ui.item("mcp-config.json", "success", f"{len(enabled_servers)} servers")
    ui.end_step()

    # ── Step 14: LSP · Config ────────────────────────────────────────────
    ui.step("LSP · Config")
    lsp_config_path = copilot_home / "lsp-config.json"
    lsp_count, lsp_skipped = generate_lsp_config(lsp_servers_json, lsp_config_path, ui)
    summary["lsp_config_generated"] = True
    summary["lsp_count"] = lsp_count
    summary["lsp_skipped"] = lsp_skipped
    ui.end_step()

    # ── Step 15: Cleanup · Stale Symlinks ────────────────────────────────
    ui.step("Cleanup · Stale Symlinks")
    linked_names = {s["name"] for s in local_skills}
    cleanup_stale(
        ui, copilot_skills, linked_names, REPO_ROOT, external_dir,
        include_clean_orphans, args.clean_orphans or args.non_interactive, summary,
    )
    ui.end_step()

    # ── Optional Dependencies (interactive only) ─────────────────────────
    if not args.non_interactive:
        run_optional_deps(ui, lsp_servers_json, lsp_config_path, summary)

    # ── Summary ──────────────────────────────────────────────────────────
    ui.summary(summary, enabled_servers)


if __name__ == "__main__":
    main()
