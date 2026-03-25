"""Git authentication detection and clone/pull helpers with multi-method fallback."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path


def _run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
    """Run a command with non-interactive git env vars."""
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GCM_INTERACTIVE"] = "never"
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        env=env,
        **kwargs,
    )


def _extract_slug(url: str) -> str | None:
    """Extract 'owner/repo' slug from a GitHub URL (HTTPS or SSH)."""
    m = re.search(r"github\.com[:/](.+?)(?:\.git)?$", url)
    return m.group(1) if m else None


def _https_to_ssh(url: str) -> str:
    """Convert https://github.com/owner/repo to git@github.com:owner/repo.git."""
    m = re.match(r"https://github\.com/(.+?)(?:\.git)?$", url)
    if m:
        return f"git@github.com:{m.group(1)}.git"
    return url


def _ssh_to_https(url: str) -> str:
    """Convert git@github.com:owner/repo.git to https://github.com/owner/repo."""
    m = re.match(r"git@github\.com:(.+?)(?:\.git)?$", url)
    if m:
        return f"https://github.com/{m.group(1)}"
    return url


# ---------------------------------------------------------------------------
# Auth detection
# ---------------------------------------------------------------------------


def detect_git_auth(ui, auth_state: dict) -> None:
    """Detect available git authentication methods and populate *auth_state*."""

    # -- GitHub CLI ---------------------------------------------------------
    try:
        r = subprocess.run(
            ["gh", "auth", "status"],
            capture_output=True,
            text=True,
        )
        combined = r.stdout + r.stderr
        accounts = re.findall(r"Logged in to github\.com account (\S+)", combined)
        if accounts:
            auth_state["gh_available"] = True
            ui.print_msg(f"GitHub CLI: logged in as {', '.join(accounts)}", "success")
            if len(accounts) > 1:
                # Find which account is active: "account NAME (...)\n  - Active account: true"
                active = re.search(
                    r"account (\S+)\s+\(keyring\)\s*\n\s*-\s*Active account:\s*true",
                    combined,
                )
                if active:
                    ui.print_msg(f"Active account: {active.group(1)}", "info")
        else:
            ui.print_msg("GitHub CLI (gh) installed but not logged in", "warn")
    except FileNotFoundError:
        ui.print_msg("GitHub CLI (gh) not installed", "warn")

    # -- SSH ----------------------------------------------------------------
    try:
        r = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "-T", "git@github.com"],
            capture_output=True,
            text=True,
        )
        combined = r.stdout + r.stderr
        m = re.search(r"Hi (\S+)!", combined)
        if m:
            auth_state["ssh_available"] = True
            auth_state["prefer_ssh"] = True
            ui.print_msg(f"SSH: authenticated as {m.group(1)}", "success")
        else:
            ui.print_msg("SSH to github.com not available — using HTTPS", "info")
    except FileNotFoundError:
        ui.print_msg("SSH client not found — using HTTPS", "info")


# ---------------------------------------------------------------------------
# Clone / pull helpers
# ---------------------------------------------------------------------------


def _get_origin_url(repo_path: str) -> str | None:
    r = _run(["git", "remote", "get-url", "origin"], cwd=repo_path)
    return r.stdout.strip() if r.returncode == 0 else None


def _get_remote_url(repo_path: str, remote: str) -> str | None:
    r = _run(["git", "remote", "get-url", remote], cwd=repo_path)
    return r.stdout.strip() if r.returncode == 0 else None


def _validate_identity(repo_path: str, expected_url: str, ui) -> bool:
    """Check that the existing repo matches the expected GitHub slug."""
    expected_slug = _extract_slug(expected_url)
    if not expected_slug:
        return True  # non-GitHub URL, skip check

    origin_url = _get_origin_url(repo_path)
    if not origin_url:
        ui.print_msg("Could not read origin URL from existing repo", "warn")
        return False

    origin_slug = _extract_slug(origin_url)
    if origin_slug and origin_slug.lower() == expected_slug.lower():
        return True

    # Fork workflow: check upstream remote
    upstream_url = _get_remote_url(repo_path, "upstream")
    if upstream_url:
        upstream_slug = _extract_slug(upstream_url)
        if upstream_slug and upstream_slug.lower() == expected_slug.lower():
            return True

    ui.print_msg(
        f"Repo identity mismatch: expected {expected_slug}, found origin={origin_slug}",
        "err",
    )
    return False


def _upgrade_remote_to_ssh(repo_path: str, ui) -> None:
    """If origin is HTTPS, switch it to SSH."""
    origin = _get_origin_url(repo_path)
    if origin and origin.startswith("https://github.com/"):
        ssh_url = _https_to_ssh(origin)
        _run(["git", "remote", "set-url", "origin", ssh_url], cwd=repo_path)
        ui.print_msg(f"Upgraded origin to SSH: {ssh_url}", "info")


def _pull(repo_path: str) -> subprocess.CompletedProcess[str]:
    return _run(["git", "pull", "--quiet"], cwd=repo_path)


def _clone(url: str, target: str) -> subprocess.CompletedProcess[str]:
    return _run(["git", "clone", "--quiet", url, target])


def _gh_clone(slug: str, target: str) -> subprocess.CompletedProcess[str]:
    return _run(["gh", "repo", "clone", slug, target])


def _gh_auth_token() -> str | None:
    r = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 and r.stdout.strip() else None


def _inject_token_url(https_url: str, token: str) -> str:
    """Inject a token into an HTTPS GitHub URL for authenticated cloning."""
    return re.sub(
        r"^https://github\.com/",
        f"https://x-access-token:{token}@github.com/",
        https_url,
    )


def _cleanup_partial(target: str) -> None:
    """Remove a partially-cloned directory."""
    p = Path(target)
    if p.exists():
        shutil.rmtree(p, ignore_errors=True)


def _pull_recovery_menu(display_name: str, repo_path: str, ui) -> str:
    """Interactive recovery after a failed pull. Returns final status."""
    while True:
        choice = ui.prompt(
            f"Pull failed for {display_name}. [C]ontinue (use local) / [R]etry / [S]kip / [A]bort",
            default="C",
        ).upper()
        if choice == "C":
            return "pull-failed"
        if choice == "R":
            r = _pull(repo_path)
            if r.returncode == 0:
                return "pulled"
            ui.print_msg(f"Retry pull failed: {r.stderr.strip()}", "err")
            continue
        if choice == "S":
            return "skipped"
        if choice == "A":
            return "aborted"


def _clone_recovery_menu(display_name: str, repo_url: str, target: str, ui) -> str:
    """Interactive recovery after all clone methods fail. Returns final status."""
    while True:
        choice = ui.prompt(
            f"All clone methods failed for {display_name}. "
            "[R]etry / [L]ogin & retry / [M]anual clone / [S]kip / [A]bort",
            default="R",
        ).upper()
        if choice == "R":
            return "retry"
        if choice == "L":
            subprocess.run(["gh", "auth", "login"], stdin=None)
            return "retry"
        if choice == "M":
            user_path = ui.prompt("Enter path to existing clone", default="")
            if user_path and Path(user_path).is_dir() and Path(user_path, ".git").is_dir():
                return f"manual:{user_path}"
            ui.print_msg("Invalid path", "err")
            continue
        if choice == "S":
            return "skipped"
        if choice == "A":
            return "aborted"


def clone_or_pull(
    repo_url: str,
    target_path: str,
    display_name: str,
    auth_state: dict,
    non_interactive: bool,
    ui,
) -> tuple[str, str]:
    """Clone or pull a git repository with fallback chain.

    Returns a tuple of (status, effective_path) where status is one of:
        "pulled", "cloned", "pull-failed", "clone-failed",
        "skipped", "aborted", "identity-check-failed"
    and effective_path is the final filesystem path (may differ from
    *target_path* if the user chose a manual path during recovery).
    """
    target = Path(target_path)
    prefer_ssh = auth_state.get("prefer_ssh", False)
    gh_available = auth_state.get("gh_available", False)
    slug = _extract_slug(repo_url) or repo_url

    # ------------------------------------------------------------------
    # Existing repo → pull
    # ------------------------------------------------------------------
    if (target / ".git").is_dir():
        repo_dir = str(target)

        # Identity check
        if not _validate_identity(repo_dir, repo_url, ui):
            return ("identity-check-failed", target_path)

        # Upgrade remote to SSH when preferred
        if prefer_ssh:
            _upgrade_remote_to_ssh(repo_dir, ui)

        r = _pull(repo_dir)
        if r.returncode == 0:
            ui.print_msg(f"{display_name}: pulled latest", "success")
            return ("pulled", target_path)

        ui.print_msg(f"{display_name}: pull failed — {r.stderr.strip()}", "err")
        if non_interactive:
            return ("pull-failed", target_path)
        status = _pull_recovery_menu(display_name, repo_dir, ui)
        return (status, target_path)

    # ------------------------------------------------------------------
    # Fresh clone with fallback chain
    # ------------------------------------------------------------------
    target_str = str(target)

    # Ensure parent directory exists
    target.parent.mkdir(parents=True, exist_ok=True)

    while True:
        # 1. Preferred URL (SSH or HTTPS)
        clone_url = _https_to_ssh(repo_url) if prefer_ssh else repo_url
        ui.print_msg(f"{display_name}: cloning from {clone_url}", "info")
        r = _clone(clone_url, target_str)
        if r.returncode == 0:
            ui.print_msg(f"{display_name}: cloned", "success")
            return ("cloned", target_str)
        if gh_available:
            ui.print_msg(f"{display_name}: trying gh repo clone", "info")
            r = _gh_clone(slug, target_str)
            if r.returncode == 0:
                ui.print_msg(f"{display_name}: cloned via gh CLI", "success")
                return ("cloned", target_str)
            _cleanup_partial(target_str)

        # 3. HTTPS with token (when preferred was SSH)
        if prefer_ssh and gh_available:
            token = _gh_auth_token()
            if token:
                https_url = _ssh_to_https(clone_url) if clone_url.startswith("git@") else repo_url
                token_url = _inject_token_url(https_url, token)
                ui.print_msg(f"{display_name}: trying HTTPS with token", "info")
                r = _clone(token_url, target_str)
                if r.returncode == 0:
                    # Reset origin to the clean URL (no embedded token)
                    _run(["git", "remote", "set-url", "origin", https_url], cwd=target_str)
                    ui.print_msg(f"{display_name}: cloned via HTTPS+token", "success")
                    return ("cloned", target_str)
                _cleanup_partial(target_str)

        # All automatic methods exhausted
        if non_interactive:
            ui.print_msg(f"{display_name}: all clone methods failed", "err")
            return ("clone-failed", target_str)

        # Interactive recovery
        action = _clone_recovery_menu(display_name, repo_url, target_str, ui)
        if action == "retry":
            continue
        if action.startswith("manual:"):
            manual_path = action.split(":", 1)[1]
            ui.print_msg(f"{display_name}: using manual path {manual_path}", "info")
            return ("cloned", manual_path)
        # "skipped" or "aborted"
        return (action, target_str)
