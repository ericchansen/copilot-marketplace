"""Cross-platform filesystem operations for Copilot CLI setup.

Provides OS-specific functions for junctions vs symlinks, path resolution,
and LSP binary validation.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

IS_WINDOWS = sys.platform == "win32"
_FILE_ATTRIBUTE_REPARSE_POINT = 0x400


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def home_dir() -> Path:
    """Return the user's home directory."""
    raw = os.environ.get("USERPROFILE") if IS_WINDOWS else os.environ.get("HOME")
    return Path(raw) if raw else Path.home()


def ensure_dir(path: Path) -> None:
    """Create *path* (and parents) if it doesn't exist."""
    path.mkdir(parents=True, exist_ok=True)


def _resolve_paths_match(a: Path, b: Path) -> bool:
    """Compare two paths for equality after resolving (case-insensitive on Windows).

    On Windows, strips the ``\\\\?\\`` extended-length prefix and resolves
    8.3 short names so that junction targets compare correctly.
    """
    sa = os.path.realpath(str(a))
    sb = os.path.realpath(str(b))
    if IS_WINDOWS:
        # Strip extended-length path prefix if present
        for prefix in ("\\\\?\\UNC\\\\", "\\\\?\\UNC\\", "\\\\?\\"):
            sa = sa.removeprefix(prefix)
            sb = sb.removeprefix(prefix)
        return sa.lower() == sb.lower()
    return sa == sb


# ---------------------------------------------------------------------------
# Link detection
# ---------------------------------------------------------------------------


def is_link(path: Path) -> bool:
    """Return True if *path* is a symlink or a Windows junction (reparse point)."""
    if path.is_symlink():
        return True
    if IS_WINDOWS:
        try:
            attrs = path.stat(follow_symlinks=False).st_file_attributes  # type: ignore[attr-defined]
            return bool(attrs & _FILE_ATTRIBUTE_REPARSE_POINT)
        except (OSError, AttributeError):
            return False
    return False


def get_link_target(path: Path) -> Path | None:
    """Return the target of a symlink/junction, or None if not a link."""
    if not is_link(path):
        return None
    try:
        return path.readlink()
    except OSError:
        # Fallback: compare resolved path to the link path itself
        try:
            resolved = path.resolve()
            if resolved != path:
                return resolved
        except OSError:
            pass
    return None


# ---------------------------------------------------------------------------
# Link removal
# ---------------------------------------------------------------------------


def remove_link(path: Path) -> None:
    """Remove a symlink or junction.

    Windows directory junctions MUST be removed with ``os.rmdir`` — using
    ``shutil.rmtree`` would delete the *target's* contents.
    """
    if IS_WINDOWS and path.is_dir():
        path.rmdir()
    else:
        path.unlink()


# ---------------------------------------------------------------------------
# Directory links (junctions on Windows, symlinks on Unix)
# ---------------------------------------------------------------------------


def create_dir_link(
    link_path: Path,
    target_path: Path,
    interactive: bool = True,
) -> str:
    """Create a directory junction (Windows) or symlink (Unix).

    Returns one of: ``"created"``, ``"exists"``, ``"skipped"``, ``"failed"``.
    """
    # --- link already exists ---
    if is_link(link_path):
        current_target = get_link_target(link_path)
        if current_target is not None and _resolve_paths_match(current_target, target_path):
            return "exists"
        # Points elsewhere — replace
        try:
            remove_link(link_path)
        except OSError:
            return "failed"

    # --- real directory exists ---
    elif link_path.is_dir():
        if interactive:
            answer = input(f"{link_path} is a real directory. Replace with junction/symlink? [y/N] ")
            if answer.strip().lower() != "y":
                return "skipped"
        else:
            return "skipped"
        try:
            shutil.rmtree(link_path)
        except OSError:
            return "failed"

    # --- create the link ---
    try:
        if IS_WINDOWS:
            subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(link_path), str(target_path)],
                capture_output=True,
                check=True,
            )
        else:
            link_path.symlink_to(target_path)
        return "created"
    except (subprocess.CalledProcessError, OSError):
        return "failed"


# ---------------------------------------------------------------------------
# File links (symlinks, with copy fallback on Windows)
# ---------------------------------------------------------------------------


def create_file_link(
    link_path: Path,
    target_path: Path,
    interactive: bool = True,
) -> str:
    """Create a file symlink (with copy-fallback on Windows).

    Returns one of:
    ``"created"``, ``"exists"``, ``"copied"``, ``"skipped"``, ``"failed"``.
    """
    # --- link already exists ---
    if is_link(link_path):
        current_target = get_link_target(link_path)
        if current_target is not None and _resolve_paths_match(current_target, target_path):
            return "exists"
        try:
            remove_link(link_path)
        except OSError:
            return "failed"

    # --- real file exists ---
    elif link_path.is_file():
        if interactive:
            answer = input(f"{link_path} is a real file. Replace with symlink? [y/N] ")
            if answer.strip().lower() != "y":
                return "skipped"
        else:
            return "skipped"
        try:
            link_path.unlink()
        except OSError:
            return "failed"

    # --- create the link ---
    if IS_WINDOWS:
        return _create_file_link_windows(link_path, target_path)

    try:
        link_path.symlink_to(target_path)
        return "created"
    except OSError:
        return "failed"


def _create_file_link_windows(link_path: Path, target_path: Path) -> str:
    """Windows file-symlink with graduated fallbacks."""
    # 1. Try cmd mklink (requires admin)
    try:
        subprocess.run(
            ["cmd", "/c", "mklink", str(link_path), str(target_path)],
            capture_output=True,
            check=True,
        )
        return "created"
    except (subprocess.CalledProcessError, OSError):
        pass

    # 2. Try os.symlink (requires Developer Mode)
    try:
        link_path.symlink_to(target_path)
        return "created"
    except OSError:
        pass

    # 3. Fall back to file copy
    try:
        shutil.copy2(target_path, link_path)
        return "copied"
    except OSError:
        return "failed"


# ---------------------------------------------------------------------------
# LSP binary validation
# ---------------------------------------------------------------------------


def validate_lsp_binary(command: str, args: list[str]) -> bool:
    """Check that an LSP server binary exists and stays alive on startup."""
    resolved = shutil.which(command)
    if resolved is None:
        return False

    cmd_list = _build_lsp_command(resolved, args)

    try:
        proc = subprocess.Popen(
            cmd_list,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW if IS_WINDOWS else 0,
        )

        # Keep stdin open — LSP servers exit immediately on EOF.
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            # Still running after 2 s → binary is functional.
            proc.kill()
            proc.wait()
            return True

        # Exited within 2 s — functional only if exit code is 0.
        return proc.returncode == 0

    except OSError:
        return False


def _build_lsp_command(resolved: str, args: list[str]) -> list[str]:
    """Translate a resolved binary path into the command list to execute.

    On Windows, npm shims (`.ps1` / `.cmd`) need special handling.
    """
    if not IS_WINDOWS:
        return [resolved, *args]

    rp = Path(resolved)
    suffix = rp.suffix.lower()

    if suffix == ".ps1":
        # Prefer a .cmd sibling (works without pwsh)
        cmd_sibling = rp.with_suffix(".cmd")
        if cmd_sibling.is_file():
            args_str = " ".join(str(a) for a in args)
            return ["cmd", "/c", f"{cmd_sibling} {args_str}".strip()]
        # No .cmd — launch via pwsh
        args_str = " ".join(str(a) for a in args)
        return ["pwsh", "-NoProfile", "-File", str(rp), *args]

    if suffix in (".cmd", ".bat"):
        args_str = " ".join(str(a) for a in args)
        return ["cmd", "/c", f"{rp} {args_str}".strip()]

    return [resolved, *args]
