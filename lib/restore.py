"""Remove setup-created symlinks/junctions and optionally restore from backup."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from lib.platform_ops import IS_WINDOWS, get_link_target, home_dir, is_link, remove_link

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def _normalize_target(target: Path) -> str:
    """Normalize a link target path for comparison.

    On Windows, junction targets may carry a ``\\\\?\\`` extended-length prefix
    that must be stripped before comparing against owned roots.
    """
    s = os.path.normpath(str(target))
    if IS_WINDOWS:
        for prefix in ("\\\\?\\UNC\\", "\\\\?\\"):
            if s.startswith(prefix):
                s = s[len(prefix) :]
    return s


def _points_into_owned_root(target: Path, owned_roots: list[str]) -> bool:
    """Return True if *target* resolves to a path under one of *owned_roots*.

    Uses os.sep boundary check to avoid matching sibling dirs like
    ``copilot-config-backup`` when the root is ``copilot-config``.
    """
    norm = _normalize_target(target)
    for root in owned_roots:
        # Ensure root ends with separator so startswith checks a real boundary
        root_with_sep = root if root.endswith(os.sep) else root + os.sep
        if IS_WINDOWS:
            if norm.lower() == root.lower() or norm.lower().startswith(root_with_sep.lower()):
                return True
        else:
            if norm == root or norm.startswith(root_with_sep):
                return True
    return False


def _build_owned_roots(repo_root: Path) -> list[str]:
    """Build the deduplicated list of filesystem roots considered 'owned' by setup."""
    home = home_dir()
    candidates = [
        repo_root,
        home / "repos" / "skills",
        home / "repos" / "copilot-config",
        home / "repos" / "msx-mcp",
        repo_root / "external",
    ]
    seen: set[str] = set()
    roots: list[str] = []
    for c in candidates:
        try:
            norm = os.path.normpath(str(c.resolve()))
        except OSError:
            norm = os.path.normpath(str(c))
        if norm not in seen:
            seen.add(norm)
            roots.append(norm)
    return roots


# ---------------------------------------------------------------------------
# Link removal
# ---------------------------------------------------------------------------


def _remove_owned_links(
    ui,
    scan_dir: Path,
    owned_roots: list[str],
    copilot_home: Path,
) -> list[str]:
    """Scan *scan_dir* and remove links whose target is under an owned root.

    Returns a list of human-readable descriptions of removed entries.
    """
    removed: list[str] = []
    if not scan_dir.is_dir():
        return removed

    for entry in sorted(scan_dir.iterdir(), key=lambda p: p.name):
        if not is_link(entry):
            continue

        target = get_link_target(entry)
        if target is None:
            continue
        if not _points_into_owned_root(target, owned_roots):
            continue

        # Build a display-friendly path (replace copilot_home prefix with ~/)
        rel_name = str(entry).replace(str(copilot_home), "~/.copilot")
        try:
            remove_link(entry)
            ui.item(rel_name, "warn", f"removed → {target}")
            removed.append(rel_name)
        except OSError:
            ui.item(rel_name, "failed", f"could not remove → {target}")

    return removed


# ---------------------------------------------------------------------------
# Backup restore
# ---------------------------------------------------------------------------


def _restore_from_backup(ui, backup_dir: Path, copilot_home: Path) -> None:
    """Copy files from *backup_dir* into *copilot_home* where they don't exist."""
    copilot_home.mkdir(parents=True, exist_ok=True)

    # Restore top-level files
    for entry in sorted(backup_dir.iterdir()):
        if not entry.is_file():
            continue
        dest = copilot_home / entry.name
        if not dest.exists():
            shutil.copy2(entry, dest)
            ui.item(entry.name, "success", "restored")
        else:
            ui.item(entry.name, "info", "already exists, skipping")

    # Restore skills subdirectories
    backup_skills = backup_dir / "skills"
    if backup_skills.is_dir():
        skills_dir = copilot_home / "skills"
        skills_dir.mkdir(parents=True, exist_ok=True)
        for skill_dir in sorted(backup_skills.iterdir()):
            if not skill_dir.is_dir():
                continue
            dest = skills_dir / skill_dir.name
            if not dest.exists():
                shutil.copytree(skill_dir, dest)
                ui.item(f"skill: {skill_dir.name}", "success", "restored")
            else:
                ui.item(f"skill: {skill_dir.name}", "info", "already exists")

    ui.print_msg("Restore complete", "success")


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def run_restore(ui, repo_root: Path, non_interactive: bool = False) -> None:
    """Remove setup-created symlinks/junctions and optionally restore from backup."""
    copilot_home = home_dir() / ".copilot"
    owned_roots = _build_owned_roots(repo_root)
    removed: list[str] = []

    # --- Step 1: Remove owned links ---
    ui.section("Remove setup symlinks/junctions")

    if not copilot_home.is_dir():
        ui.print_msg("~/.copilot/ does not exist — nothing to do", "info")
    else:
        removed.extend(_remove_owned_links(ui, copilot_home, owned_roots, copilot_home))

        skills_dir = copilot_home / "skills"
        if skills_dir.is_dir():
            removed.extend(_remove_owned_links(ui, skills_dir, owned_roots, copilot_home))
            # Remove skills dir if now empty
            try:
                if not any(skills_dir.iterdir()):
                    skills_dir.rmdir()
                    ui.print_msg("Removed empty ~/.copilot/skills/", "info")
            except OSError:
                pass

    if not removed:
        ui.print_msg("No symlinks/junctions found pointing into managed roots", "info")

    # --- Step 2: Offer to restore from backup ---
    ui.section("Check for backups")

    home = home_dir()
    backups = sorted(
        (d for d in home.iterdir() if d.is_dir() and d.name.startswith(".copilot-backup-")),
        key=lambda d: d.name,
        reverse=True,
    )

    if not backups:
        ui.print_msg("No ~/.copilot-backup-* directories found", "info")
    else:
        latest = backups[0]
        ui.print_msg(f"Found {len(backups)} backup(s). Most recent: {latest.name}", "info")

        should_restore = False
        if not non_interactive:
            should_restore = ui.confirm(f"Restore from {latest.name}?")

        if should_restore:
            _restore_from_backup(ui, latest, copilot_home)
        else:
            ui.print_msg("Skipping restore", "info")

    # --- Summary ---
    ui.section("Restore Summary")
    if removed:
        ui.print_msg(f"Removed {len(removed)} symlink(s)/junction(s):", "info")
        for r in removed:
            ui.print_msg(f"  • {r}", "dim")
    else:
        ui.print_msg("No symlinks/junctions were removed", "info")
