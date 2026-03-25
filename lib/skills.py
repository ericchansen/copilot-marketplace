"""Skills management — linking, legacy cleanup, plugin install/update, orphan cleanup."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

from lib.platform_ops import create_dir_link, get_link_target, is_link, remove_link

# Legacy keys to strip from .external-paths.json during cleanup
_EXTERNAL_PATHS_LEGACY_KEYS = ("anthropic", "github", "msx-mcp", "spt-iq")


# ---------------------------------------------------------------------------
# Skill discovery
# ---------------------------------------------------------------------------


def get_skill_folders(base_path: Path) -> list[dict]:
    """Return skill folder objects from *base_path*.

    A folder is a skill if it contains ``SKILL.md``.
    """
    if not base_path.is_dir():
        return []
    return sorted(
        [
            {"name": entry.name, "path": str(entry.resolve())}
            for entry in base_path.iterdir()
            if entry.is_dir() and (entry / "SKILL.md").exists()
        ],
        key=lambda s: s["name"],
    )


# ---------------------------------------------------------------------------
# Skill linking
# ---------------------------------------------------------------------------


def link_skills(
    ui,
    skills: list[dict],
    copilot_skills: Path,
    non_interactive: bool,
    summary: dict,
) -> None:
    """Create directory junctions/symlinks for each skill into *copilot_skills*."""
    for skill in skills:
        name = skill["name"]
        target = Path(skill["path"])
        link_path = copilot_skills / name

        result = create_dir_link(link_path, target, interactive=not non_interactive)

        if result == "created":
            ui.item(name, "created", f"→ {target}")
            summary["skills_created"].append(name)
        elif result == "exists":
            ui.item(name, "exists", "already linked")
            summary["skills_existed"].append(name)
        elif result == "skipped":
            ui.item(name, "skipped", "real directory — user declined")
            summary["skills_skipped"].append(name)
        else:
            ui.item(name, "failed", "could not create link")
            summary["skills_failed"].append(name)


# ---------------------------------------------------------------------------
# Legacy junction cleanup
# ---------------------------------------------------------------------------


def legacy_cleanup(
    ui,
    copilot_skills: Path,
    repo_root: Path,
    legacy_patterns: list[str],
    summary: dict,
) -> None:
    """Remove leftover junctions that point into legacy clone directories.

    These skills are now installed via ``copilot plugin install`` and the old
    junctions should be cleaned up.
    """
    cleaned = 0

    if copilot_skills.is_dir():
        for entry in list(copilot_skills.iterdir()):
            if not is_link(entry):
                continue
            target = get_link_target(entry)
            if target is None:
                continue
            target_str = str(target)
            for pattern in legacy_patterns:
                if pattern in target_str:
                    try:
                        remove_link(entry)
                        ui.item(entry.name, "warn", f"removed legacy junction → {target}")
                        cleaned += 1
                    except OSError:
                        ui.item(entry.name, "failed", f"could not remove → {target}")
                    break

    # Clean legacy entries from .external-paths.json
    ext_paths_file = repo_root / ".external-paths.json"
    if ext_paths_file.exists():
        try:
            data = json.loads(ext_paths_file.read_text("utf-8"))
            before = len(data)
            for key in _EXTERNAL_PATHS_LEGACY_KEYS:
                data.pop(key, None)
            if len(data) < before:
                ext_paths_file.write_text(json.dumps(data, indent=2) + "\n", "utf-8")
                ui.item(".external-paths.json", "info", "cleaned legacy entries")
        except (json.JSONDecodeError, OSError):
            pass

    if cleaned:
        ui.item("Legacy junctions", "info", f"removed {cleaned}")
        ui.print_msg("Install community skills via plugins instead:", "info")
    summary["plugin_junctions_cleaned"] = cleaned


# ---------------------------------------------------------------------------
# Plugin install
# ---------------------------------------------------------------------------


def install_plugins(ui, plugins: list[dict], local_clone_map: dict[str, Path], summary: dict) -> None:
    """Install Copilot CLI plugins that are not yet present.

    Plugins whose name appears in *local_clone_map* are skipped because a
    local development clone was detected (local-clone-wins pattern).  Their
    skills and agents are linked separately by :func:`link_local_plugins`.
    """
    if not shutil.which("copilot"):
        ui.print_msg("copilot CLI not found — skipping plugin install", "warn")
        return

    # Snapshot of currently installed plugins
    installed_output = _run_copilot(["plugin", "list"])

    for plugin in plugins:
        name = plugin["name"]
        source = plugin["source"]

        # Local-clone-wins: skip plugin when a dev clone exists
        if name in local_clone_map:
            ui.item(name, "info", "local clone detected — skipping plugin install")
            summary["plugins_skipped"].append(name)
            continue

        if installed_output and name in installed_output:
            ui.item(name, "exists", "already installed")
            summary["plugins_skipped"].append(name)
            continue

        result = _run_copilot(["plugin", "install", source], check=False)
        if result is not None:
            ui.item(name, "created", f"installed from {source}")
            summary["plugins_installed"].append(name)
            # Disable-by-default for alias plugins (opt-in via shell alias)
            if plugin.get("alias"):
                disable_result = _run_copilot(["plugin", "disable", name], check=False)
                if disable_result is not None:
                    ui.print_msg(f"disabled by default — use '{plugin['alias']}' alias to opt in", "info")
                else:
                    ui.item(
                        name,
                        "warn",
                        f"could not disable automatically — run 'copilot plugin disable {name}' if needed",
                    )
        else:
            ui.item(name, "failed", f"install failed for {source}")
            summary["plugins_failed"].append(name)


# ---------------------------------------------------------------------------
# Local plugin registration (local-clone-wins)
# ---------------------------------------------------------------------------


def _plugin_slug(source: str) -> str:
    """Convert a plugin source like ``owner/repo`` to the installed-plugins slug."""
    return source.replace("/", "--")


def link_local_plugins(
    ui,
    plugins: list[dict],
    local_clone_map: dict[str, Path],
    config_json_path: Path,
    summary: dict,
) -> None:
    """Register local plugin clones so Copilot CLI sees them as installed plugins.

    For each local clone, creates a directory junction in
    ``~/.copilot/installed-plugins/_direct/<slug>/`` and registers the plugin
    in ``config.json``'s ``installed_plugins`` array.  This gives the full
    plugin experience (skills, agents, MCP servers, hooks) from a local
    source checkout — edits to the clone are reflected immediately.
    """
    installed_plugins_dir = config_json_path.parent / "installed-plugins" / "_direct"
    installed_plugins_dir.mkdir(parents=True, exist_ok=True)

    # Read config.json once
    try:
        config_obj = json.loads(config_json_path.read_text("utf-8")) if config_json_path.exists() else {}
    except (json.JSONDecodeError, OSError):
        config_obj = {}
    registered: list[dict] = config_obj.get("installed_plugins", [])
    if not isinstance(registered, list):
        registered = []
    registered_names = {name for p in registered if isinstance(p, dict) for name in [p.get("name")] if name is not None}
    config_dirty = False

    for plugin in plugins:
        name = plugin["name"]
        if name not in local_clone_map:
            continue

        clone_path = local_clone_map[name]
        source = plugin["source"]
        slug = _plugin_slug(source)
        junction_path = installed_plugins_dir / slug

        # Read version from local plugin.json
        version = "0.0.0"
        plugin_json_path = clone_path / "plugin.json"
        if plugin_json_path.exists():
            try:
                meta = json.loads(plugin_json_path.read_text("utf-8"))
                version = meta.get("version", version)
            except (json.JSONDecodeError, OSError):
                pass

        # ── Junction ──────────────────────────────────────────────────
        result = create_dir_link(junction_path, clone_path, interactive=False)
        if result == "created":
            ui.item(name, "created", f"plugin junction → {clone_path}")
        elif result == "exists":
            ui.item(name, "exists", "plugin junction OK")
        elif result == "skipped":
            ui.item(
                name,
                "skipped",
                f"plugin junction path exists as real directory: {junction_path} — remove or replace to relink",
            )
            continue
        else:
            ui.item(name, "failed", f"could not create plugin junction → {clone_path}")
            continue

        # ── config.json registration ──────────────────────────────────
        if name not in registered_names:
            from datetime import datetime, timezone

            registered.append(
                {
                    "name": name,
                    "marketplace": "",
                    "version": version,
                    "installed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                    "enabled": not bool(plugin.get("alias")),
                    "cache_path": str(junction_path),
                    "source": {"source": "github", "repo": source},
                }
            )
            registered_names.add(name)
            config_dirty = True
            ui.item(name, "created", f"registered as plugin (v{version})")
        else:
            ui.item(name, "exists", "already registered in config.json")

    if config_dirty:
        config_obj["installed_plugins"] = registered
        config_json_path.write_text(json.dumps(config_obj, indent=2) + "\n", "utf-8")


# ---------------------------------------------------------------------------
# Plugin update
# ---------------------------------------------------------------------------

_PLUGIN_LINE_RE = re.compile(
    r"^\s*[•·]\s+(?P<name>\S+?)(?:@(?P<source>\S+))?\s+\(v[\d.]+\)",
)


def update_plugins(ui, summary: dict) -> None:
    """Update all installed non-local plugins."""
    if not shutil.which("copilot"):
        ui.print_msg("copilot CLI not found — skipping plugin update", "warn")
        return

    installed_output = _run_copilot(["plugin", "list"])
    if not installed_output:
        ui.item("Plugins", "info", "no plugins installed")
        return

    for line in installed_output.splitlines():
        m = _PLUGIN_LINE_RE.match(line)
        if not m:
            continue

        name = m.group("name")
        source = m.group("source") or ""

        # Skip filesystem-managed plugins — can't update via CLI
        if source == "local":
            continue

        result = _run_copilot(["plugin", "update", name], check=False)
        if result is None:
            ui.item(name, "failed", "update failed")
            summary["plugins_update_failed"].append(name)
        elif "already up to date" in result.lower() or "up-to-date" in result.lower():
            ui.item(name, "exists", "already up to date")
            summary["plugins_update_skipped"].append(name)
        else:
            ui.item(name, "created", "updated")
            summary["plugins_updated"].append(name)


# ---------------------------------------------------------------------------
# Stale symlink / orphan cleanup
# ---------------------------------------------------------------------------


def cleanup_stale(
    ui,
    copilot_skills: Path,
    linked_names: set[str],
    repo_root: Path,
    external_dir: Path,
    include_clean_orphans: bool,
    auto_remove: bool,
    summary: dict,
) -> None:
    """Remove stale symlinks/junctions from the skills directory.

    *include_clean_orphans*
        When ``True`` any entry not in *linked_names* is a candidate for removal.
        *auto_remove* controls whether to prompt or just remove.

    When ``False`` only entries whose link target lives under *repo_root* or
    *external_dir* — but are not in *linked_names* — are removed (managed
    roots only).
    """
    if not copilot_skills.is_dir():
        return

    removed = 0
    remove_all = auto_remove

    for entry in sorted(copilot_skills.iterdir(), key=lambda p: p.name):
        name = entry.name
        if name in linked_names:
            continue

        should_remove = False

        if include_clean_orphans:
            should_remove = True
        else:
            # Only remove if target is under a managed root
            target = get_link_target(entry) if is_link(entry) else None
            if target is not None:
                target_path = Path(target).resolve()
                repo_root_path = Path(repo_root).resolve()
                external_dir_path = Path(external_dir).resolve()
                if target_path.is_relative_to(repo_root_path) or target_path.is_relative_to(external_dir_path):
                    should_remove = True

        if not should_remove:
            continue

        # Prompt unless auto-removing
        if not remove_all:
            answer = ui.prompt(f"Remove orphan skill '{name}'? (Y/n/a)")
            choice = answer.strip().lower() or "y"  # default Y on Enter
            if choice == "a":
                remove_all = True
            elif choice == "n":
                ui.item(name, "skipped", "kept by user")
                continue

        try:
            if is_link(entry):
                remove_link(entry)
            elif entry.is_dir():
                shutil.rmtree(entry)
            else:
                entry.unlink()
            ui.item(name, "warn", "removed orphan")
            removed += 1
        except OSError as exc:
            ui.item(name, "failed", f"could not remove: {exc}")

    if removed:
        ui.item("Orphan cleanup", "info", f"removed {removed} stale skill(s)")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run_copilot(args: list[str], *, check: bool = True) -> str | None:
    """Run a ``copilot`` CLI sub-command and return stdout, or None on failure."""
    try:
        proc = subprocess.run(
            ["copilot", *args],
            capture_output=True,
            text=True,
            check=check,
        )
        if not check and proc.returncode != 0:
            return None
        return proc.stdout
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return None


# ---------------------------------------------------------------------------
# Untracked skill sync (replaces sync-skills.ps1)
# ---------------------------------------------------------------------------


def _parse_skill_description(skill_md: Path) -> str:
    """Extract the ``description`` field from SKILL.md YAML frontmatter."""
    try:
        content = skill_md.read_text(encoding="utf-8")
    except OSError:
        return ""

    in_frontmatter = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped == "---":
            if in_frontmatter:
                break  # end of frontmatter
            in_frontmatter = True
            continue
        if in_frontmatter and stripped.lower().startswith("description:"):
            desc = stripped[len("description:") :].strip()
            # Strip surrounding quotes
            if len(desc) >= 2 and desc[0] in ("'", '"') and desc[-1] == desc[0]:
                desc = desc[1:-1]
            if len(desc) > 80:
                desc = desc[:80] + "..."
            return desc
    return ""


def sync_untracked_skills(
    ui,
    repo_skills: Path,
    copilot_skills: Path,
    non_interactive: bool = False,
) -> None:
    """Find and adopt untracked skills from ~/.copilot/skills/ into the repo."""
    if not copilot_skills.is_dir():
        ui.print_msg("~/.copilot/skills/ not found — nothing to sync", "info")
        return

    # Discover real directories with SKILL.md that aren't already in the repo
    untracked: list[Path] = []
    for entry in sorted(copilot_skills.iterdir(), key=lambda p: p.name):
        if not entry.is_dir():
            continue
        if is_link(entry):
            continue
        if not (entry / "SKILL.md").exists():
            continue
        if (repo_skills / entry.name).exists():
            continue
        untracked.append(entry)

    if not untracked:
        ui.print_msg("No untracked skills found — everything is in sync!", "info")
        return

    ui.print_msg(f"Found {len(untracked)} untracked skill(s)", "info")

    adopted = 0
    skipped = 0

    for skill_path in untracked:
        name = skill_path.name
        desc = _parse_skill_description(skill_path / "SKILL.md")
        detail = f"  {desc}" if desc else ""
        ui.print_msg(f"📦 {name}{detail}", "info")

        should_adopt = True if non_interactive else ui.confirm(f"Adopt '{name}' into repo?", default=True)

        if not should_adopt:
            skipped += 1
            ui.item(name, "skipped", "declined by user")
            continue

        dest = repo_skills / name
        try:
            shutil.move(str(skill_path), str(dest))
        except OSError as exc:
            ui.item(name, "failed", f"could not move: {exc}")
            continue

        # Create junction/symlink back to ~/.copilot/skills/
        result = create_dir_link(skill_path, dest, interactive=False)
        if result in ("created", "exists"):
            ui.item(name, "success", "adopted and linked")
            adopted += 1
        else:
            ui.item(name, "warn", "moved but junction failed — run setup.py to fix")
            adopted += 1

    # Summary
    ui.print_msg(f"Adopted: {adopted}, Skipped: {skipped}", "info")
    if adopted > 0:
        ui.print_msg("Next steps:", "info")
        ui.print_msg('  git add -A && git commit -m "feat: adopt new skills"', "dim")
        ui.print_msg("  git push", "dim")
