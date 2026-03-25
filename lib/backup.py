"""Back up ~/.copilot/ configuration files before making changes."""

from __future__ import annotations

import os
import shutil
from datetime import datetime
from pathlib import Path

from lib.platform_ops import IS_WINDOWS, get_link_target, home_dir, is_link

_CONFIG_FILES = [
    "config.json",
    "copilot-instructions.md",
    "lsp-config.json",
    "mcp-config.json",
]

_MAX_BACKUPS = 5


def backup_copilot_home(ui, copilot_home: Path, summary: dict) -> None:
    """Back up ~/.copilot/ config files to a timestamped directory."""
    if not copilot_home.exists():
        ui.item("No existing ~/.copilot/", "info")
        return

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = home_dir() / f".copilot-backup-{timestamp}"
    backup_dir.mkdir(parents=True)

    # Back up individual config files
    for name in _CONFIG_FILES:
        src = copilot_home / name
        if src.exists():
            shutil.copy2(src, backup_dir / name)

    # Back up skills/ directory
    skills_dir = copilot_home / "skills"
    if skills_dir.is_dir():
        backup_skills = backup_dir / "skills"
        backup_skills.mkdir()
        manifest = backup_dir / "skills" / "_junctions.txt"

        for entry in sorted(skills_dir.iterdir()):
            if not entry.is_dir():
                continue
            if is_link(entry):
                target = get_link_target(entry)
                with open(manifest, "a", encoding="utf-8") as fh:
                    fh.write(f"{entry.name} -> {target}\n")
            else:
                shutil.copytree(entry, backup_skills / entry.name)

    ui.item("Backed up", "success", str(backup_dir))
    summary["backed_up"] = True
    summary["backup_dir"] = str(backup_dir)

    # Prune old backups, keeping only the 5 most recent
    _cleanup_old_backups(ui, home_dir())


def _cleanup_old_backups(ui, parent: Path) -> None:
    """Remove old .copilot-backup-* directories beyond the retention limit."""
    backups = sorted(
        (d for d in parent.iterdir() if d.is_dir() and d.name.startswith(".copilot-backup-")),
        key=lambda d: d.name,
        reverse=True,
    )
    stale = backups[_MAX_BACKUPS:]
    for d in stale:
        shutil.rmtree(d)
    if stale:
        ui.print_msg(f"Cleaned up {len(stale)} old backup(s)", "info")


# ---------------------------------------------------------------------------
# OneDrive backup (replaces backup.ps1)
# ---------------------------------------------------------------------------

_PERSONALIZATION_FILES = [
    "sensitive-terms.txt",
    "email-signature.html",
    "email-style.md",
    "permissions-config.json",
    "powerbi-mcp-proxy.mjs",
]

_MAX_SESSION_SNAPSHOTS = 10


def _format_size(size_bytes: int) -> str:
    """Return human-readable file size (KB or MB)."""
    if size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    return f"{size_bytes / 1024:.1f} KB"


def _detect_onedrive() -> Path | None:
    """Detect the OneDrive sync folder.

    Priority: ONEDRIVE_BACKUP_DIR env → OneDriveCommercial env → platform default.
    """
    candidates: list[Path] = []

    env_override = os.environ.get("ONEDRIVE_BACKUP_DIR")
    if env_override:
        candidates.append(Path(env_override))

    commercial = os.environ.get("OneDriveCommercial")
    if commercial:
        candidates.append(Path(commercial))

    home = home_dir()
    if IS_WINDOWS:
        candidates.append(home / "OneDrive - Microsoft")
    else:
        candidates.append(home / "Library" / "CloudStorage" / "OneDrive-Microsoft")

    for c in candidates:
        if c.is_dir():
            return c
    return None


def onedrive_backup(ui, skip_session: bool = False) -> dict:
    """Back up personalization files + session store to OneDrive."""
    summary: dict = {
        "files_copied": 0,
        "files_skipped": 0,
        "session_backed_up": False,
        "snapshots_pruned": 0,
    }

    copilot_home = home_dir() / ".copilot"
    if not copilot_home.is_dir():
        ui.print_msg("~/.copilot/ not found", "err")
        return summary

    onedrive = _detect_onedrive()
    if onedrive is None:
        ui.print_msg(
            "OneDrive sync folder not found — is OneDrive for Business signed in?",
            "err",
        )
        return summary

    backup_dir = onedrive / "Documents" / "Copilot Config Backup"
    backup_dir.mkdir(parents=True, exist_ok=True)
    ui.print_msg(f"Backup folder: {backup_dir}", "info")

    # --- Personalization files ---
    ui.step("Config Files")
    for name in _PERSONALIZATION_FILES:
        src = copilot_home / name
        if src.is_file():
            shutil.copy2(src, backup_dir / name)
            size = _format_size(src.stat().st_size)
            ui.item(name, "success", size)
            summary["files_copied"] += 1
        else:
            ui.item(name, "skipped", "not found")
            summary["files_skipped"] += 1
    ui.end_step()

    # --- Session store ---
    ui.step("Session Store")
    if not skip_session:
        session_db = copilot_home / "session-store.db"
        if session_db.is_file():
            snap_dir = backup_dir / "session-snapshots"
            snap_dir.mkdir(parents=True, exist_ok=True)

            today = datetime.now().strftime("%Y-%m-%d")
            dated_name = f"session-store-{today}.db"
            size = _format_size(session_db.stat().st_size)
            ui.print_msg(f"Copying session-store.db ({size})...", "dim")

            shutil.copy2(session_db, snap_dir / dated_name)
            shutil.copy2(session_db, snap_dir / "session-store-latest.db")
            ui.item(dated_name, "success", size)
            ui.item("session-store-latest.db", "success", "quick restore copy")
            summary["session_backed_up"] = True

            # Prune old snapshots — keep last 10
            snapshots = sorted(
                (f for f in snap_dir.iterdir() if f.name.startswith("session-store-2") and f.name.endswith(".db")),
                key=lambda f: f.name,
                reverse=True,
            )
            stale = snapshots[_MAX_SESSION_SNAPSHOTS:]
            for old in stale:
                old.unlink()
                ui.item(old.name, "skipped", "pruned old snapshot")
            summary["snapshots_pruned"] = len(stale)
        else:
            ui.item("session-store.db", "skipped", "not found")
    else:
        ui.item("session-store.db", "skipped", "--skip-session")
    ui.end_step()

    summary["backup_dir"] = str(backup_dir)
    return summary
