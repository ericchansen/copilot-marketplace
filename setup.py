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
import sys
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

from lib.ui import UI  # noqa: E402
from lib.platform_ops import home_dir  # noqa: E402
from lib.optional_deps import run_optional_deps  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
COPILOT_DIR = ".copilot"
SKILLS_DIR = "skills"


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
    """Run the full setup flow using the step-based architecture."""
    from copilot_setup.models import SetupContext
    from copilot_setup.runner import run_steps
    from copilot_setup.steps import ALL_STEPS

    # Derived paths
    repo_copilot = REPO_ROOT / COPILOT_DIR
    repo_skills = repo_copilot / SKILLS_DIR
    external_dir = REPO_ROOT / "external"
    copilot_home = home_dir() / ".copilot"
    config_json_path = copilot_home / "config.json"
    portable_json_path = repo_copilot / "config.portable.json"
    mcp_servers_json = REPO_ROOT / "mcp-servers.json"
    lsp_servers_json = REPO_ROOT / "lsp-servers.json"

    # Interactive pre-flight prompts
    include_work = args.work
    include_clean_orphans = args.clean_orphans

    if not args.non_interactive:
        temp_ui = UI(["prompt"])
        if not include_work:
            include_work = temp_ui.confirm("Include work tools? (MSX-MCP plugin + Power BI MCP)")
        if not include_clean_orphans:
            include_clean_orphans = temp_ui.confirm("Remove skills not managed by this repo?")

    # Build context
    ctx = SetupContext(
        repo_root=REPO_ROOT,
        copilot_home=copilot_home,
        config_json=config_json_path,
        external_dir=external_dir,
        repo_copilot=repo_copilot,
        repo_skills=repo_skills,
        mcp_servers_json=mcp_servers_json,
        lsp_servers_json=lsp_servers_json,
        portable_json=portable_json_path,
        args=args,
        include_work=include_work,
        include_clean_orphans=include_clean_orphans,
        non_interactive=args.non_interactive,
    )

    # Build step name list for the UI progress bar
    step_names = [s.name for s in ALL_STEPS]
    ui = UI(step_names)
    ui.header("📦  Copilot Config & Skills Setup")

    # Run all steps
    summary = run_steps(ALL_STEPS, ctx, ui)

    # Optional dependencies (interactive only)
    if not args.non_interactive:
        lsp_config_path = copilot_home / "lsp-config.json"
        opt_summary: dict = {
            "optional_installed": [],
            "optional_skipped": [],
            "optional_failed": [],
        }
        run_optional_deps(ui, lsp_servers_json, lsp_config_path, opt_summary)

    # Summary — bridge to old UI summary for now
    old_summary: dict = {
        "backed_up": False,
        "backup_dir": "",
        "config_files_linked": [i.name for i in summary.items_by_status("created")],
        "config_files_skipped": [],
        "config_patched": False,
        "trusted_folder_added": False,
        "skills_created": [],
        "skills_existed": [],
        "skills_skipped": [],
        "skills_failed": [],
        "mcp_servers_built": [],
        "mcp_servers_failed": [i.name for i in summary.items_by_status("failed")],
        "mcp_env_missing": [],
        "mcp_config_generated": True,
        "mcp_server_count": len(ctx.enabled_servers),
        "lsp_config_generated": True,
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
    ui.summary(old_summary, ctx.enabled_servers)


if __name__ == "__main__":
    main()
