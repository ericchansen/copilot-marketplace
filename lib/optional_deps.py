"""Optional dependency installs — LSP servers, MarkItDown, QMD, Playwright."""

from __future__ import annotations

import contextlib
import os
import shutil
import subprocess
import sys
from pathlib import Path

# On Windows, npm/npx/node/rustup are .cmd shims that require shell=True.
_SHELL = sys.platform == "win32"


def _npm_needs_admin() -> bool:
    """Check if npm global installs require elevated privileges."""
    npm = shutil.which("npm")
    if not npm:
        return False
    try:
        r = subprocess.run(["npm", "config", "get", "prefix"], capture_output=True, text=True, shell=_SHELL)
        prefix = r.stdout.strip()
        if prefix and Path(prefix).exists():
            test = Path(prefix) / ".copilot-write-test"
            try:
                test.write_text("")
                test.unlink()
                return False
            except OSError:
                return True
    except Exception:
        pass
    return False


def _npm_install_global(packages: list[str], ui) -> bool:
    """Install npm packages globally, handling admin requirements."""
    needs_admin = _npm_needs_admin()
    if needs_admin and os.name == "nt":
        import ctypes

        is_admin = ctypes.windll.shell32.IsUserAnAdmin() != 0
        if not is_admin:
            ui.print_msg("Node is installed system-wide — global npm installs need Administrator", "warn")
            ui.print_msg("Re-run as Administrator, or use nvm-windows for user-scoped Node.", "info")
            return False
    r = subprocess.run(["npm", "install", "-g", *packages], capture_output=True, text=True, shell=_SHELL)
    return r.returncode == 0


def _validate_lsp(command: str, args: list[str]) -> bool:
    from lib.platform_ops import validate_lsp_binary

    return validate_lsp_binary(command, args)


def run_optional_deps(ui, lsp_json_path: Path, lsp_config_path: Path, summary: dict) -> None:
    """Interactive optional dependency installs."""
    ui.section("Optional Dependencies")
    ui.print_msg("These tools enhance specific skills. Install now or later.", "dim")
    ui.print_msg("The agent works without them but some skills will be limited.", "dim")

    lsp_installed_any = False

    # ── TypeScript Language Server ────────────────────────────────────────
    if _validate_lsp("typescript-language-server", ["--stdio"]):
        ui.print_msg("typescript-language-server already installed", "success")
        summary["optional_skipped"].append("typescript-language-server")
    else:
        if shutil.which("typescript-language-server"):
            ui.print_msg("typescript-language-server found on PATH but not working", "warn")
        print()
        print("  TypeScript Language Server gives the agent code intelligence for")
        print("  .ts, .tsx, .js, and .jsx files (types, definitions, references).")
        print()
        ans = ui.confirm("Install typescript-language-server?", default=True)
        if ans:
            ui.print_msg("Installing typescript-language-server and typescript via npm…", "info")
            if _npm_install_global(["typescript-language-server", "typescript"], ui):
                ui.print_msg("typescript-language-server installed", "success")
                summary["optional_installed"].append("typescript-language-server")
                lsp_installed_any = True
            else:
                ui.print_msg("typescript-language-server install failed", "err")
                summary["optional_failed"].append("typescript-language-server")
        else:
            ui.print_msg("Skipped typescript-language-server", "info")
            summary["optional_skipped"].append("typescript-language-server")

    # ── Pyright Language Server ───────────────────────────────────────────
    if _validate_lsp("pyright-langserver", ["--stdio"]):
        ui.print_msg("pyright-langserver already installed", "success")
        summary["optional_skipped"].append("pyright-langserver")
    else:
        if shutil.which("pyright-langserver"):
            ui.print_msg("pyright-langserver found on PATH but not working", "warn")
        print()
        print("  Pyright gives the agent code intelligence for Python files")
        print("  (type checking, definitions, references).")
        print()
        ans = ui.confirm("Install pyright-langserver?", default=True)
        if ans:
            ui.print_msg("Installing pyright via npm…", "info")
            if _npm_install_global(["pyright"], ui):
                ui.print_msg("pyright-langserver installed", "success")
                summary["optional_installed"].append("pyright-langserver")
                lsp_installed_any = True
            else:
                ui.print_msg("pyright-langserver install failed", "err")
                summary["optional_failed"].append("pyright-langserver")
        else:
            ui.print_msg("Skipped pyright-langserver", "info")
            summary["optional_skipped"].append("pyright-langserver")

    # ── Rust Analyzer ─────────────────────────────────────────────────────
    if _validate_lsp("rust-analyzer", []):
        ui.print_msg("rust-analyzer already installed", "success")
        summary["optional_skipped"].append("rust-analyzer")
    else:
        if shutil.which("rust-analyzer"):
            ui.print_msg("rust-analyzer found on PATH but not working", "warn")
        if not shutil.which("rustup"):
            print()
            print("  rust-analyzer requires the Rust toolchain, which isn't installed.")
            print("  To install Rust: https://rustup.rs")
            print("  After installing Rust, re-run setup to add rust-analyzer.")
            print()
            summary["optional_skipped"].append("rust-analyzer")
        else:
            print()
            print("  rust-analyzer gives the agent code intelligence for Rust files.")
            print()
            ans = ui.confirm("Install rust-analyzer?", default=True)
            if ans:
                ui.print_msg("Installing rust-analyzer via rustup…", "info")
                r = subprocess.run(
                    ["rustup", "component", "add", "rust-analyzer"], capture_output=True, text=True, shell=_SHELL
                )
                if r.returncode == 0:
                    ui.print_msg("rust-analyzer installed", "success")
                    summary["optional_installed"].append("rust-analyzer")
                    lsp_installed_any = True
                else:
                    ui.print_msg("rust-analyzer install failed", "err")
                    summary["optional_failed"].append("rust-analyzer")
            else:
                ui.print_msg("Skipped rust-analyzer", "info")
                summary["optional_skipped"].append("rust-analyzer")

    # ── MarkItDown ────────────────────────────────────────────────────────
    if shutil.which("markitdown"):
        ui.print_msg("MarkItDown already installed", "success")
        summary["optional_skipped"].append("markitdown")
    else:
        print()
        print("  MarkItDown lets the agent read PDF, Word, Excel, and PowerPoint")
        print("  files by converting them to markdown text.")
        print()
        ans = ui.confirm("Install MarkItDown?", default=True)
        if ans:
            _install_markitdown(ui, summary)
        else:
            ui.print_msg("Skipped MarkItDown", "info")
            summary["optional_skipped"].append("markitdown")

    # ── QMD ───────────────────────────────────────────────────────────────
    if shutil.which("qmd"):
        ui.print_msg("QMD already installed", "success")
        summary["optional_skipped"].append("qmd")
    else:
        node_ok = False
        node_path = shutil.which("node")
        if node_path:
            try:
                r = subprocess.run(["node", "--version"], capture_output=True, text=True, shell=_SHELL)
                ver = r.stdout.strip().lstrip("v")
                major = int(ver.split(".")[0])
                if major >= 22:
                    node_ok = True
            except Exception:
                pass
        if not node_ok:
            node_ver_str = "not found"
            if node_path:
                with contextlib.suppress(Exception):
                    node_ver_str = subprocess.run(
                        ["node", "--version"], capture_output=True, text=True, shell=_SHELL
                    ).stdout.strip()
            ui.print_msg(f"QMD requires Node.js 22+ (current: {node_ver_str})", "warn")
            summary["optional_skipped"].append("qmd")
        else:
            print()
            print("  QMD (Query MarkDown) provides local hybrid search for the")
            print("  agent's memory. Requires Node.js 22+.")
            print()
            ans = ui.confirm("Install QMD?", default=True)
            if ans:
                ui.print_msg("Installing @tobilu/qmd via npm…", "info")
                if _npm_install_global(["@tobilu/qmd"], ui):
                    ui.print_msg("QMD installed", "success")
                    summary["optional_installed"].append("qmd")
                else:
                    ui.print_msg("QMD install failed", "err")
                    summary["optional_failed"].append("qmd")
            else:
                ui.print_msg("Skipped QMD", "info")
                summary["optional_skipped"].append("qmd")

    # ── Playwright Edge driver ────────────────────────────────────────────
    edge_installed = False
    if os.name == "nt":
        ms_pw_dir = Path(os.environ.get("LOCALAPPDATA", "")) / "ms-playwright"
    else:
        ms_pw_dir = Path.home() / ".cache" / "ms-playwright"
    if ms_pw_dir.exists():
        edge_dirs = [d for d in ms_pw_dir.iterdir() if d.is_dir() and "msedge" in d.name]
        if edge_dirs:
            edge_installed = True

    if edge_installed:
        ui.print_msg("Playwright Edge driver already installed", "success")
        summary["optional_skipped"].append("playwright-edge")
    else:
        print()
        print("  Playwright lets the agent interact with web browsers — take")
        print("  screenshots, click buttons, fill forms, and verify web apps.")
        print()
        ans = ui.confirm("Install Playwright Edge driver?")
        if ans:
            ui.print_msg("Installing Playwright Edge driver…", "info")
            r = subprocess.run(
                ["npx", "playwright", "install", "msedge"],
                capture_output=True,
                text=True,
                shell=_SHELL,
                encoding="utf-8",
                errors="replace",
            )
            if r.returncode == 0:
                ui.print_msg("Playwright Edge driver installed", "success")
                summary["optional_installed"].append("playwright-edge")
            else:
                ui.print_msg("Playwright Edge install failed", "err")
                summary["optional_failed"].append("playwright-edge")
        else:
            ui.print_msg("Skipped Playwright Edge driver", "info")
            summary["optional_skipped"].append("playwright-edge")

    # ── Re-generate LSP config if any LSP servers installed ──────────────
    lsp_items = {"typescript-language-server", "pyright-langserver", "rust-analyzer"}
    if lsp_installed_any and any(i in lsp_items for i in summary["optional_installed"]):
        from lib.config import generate_lsp_config

        count, skipped = generate_lsp_config(lsp_json_path, lsp_config_path, ui)
        summary["lsp_count"] = count
        summary["lsp_skipped"] = skipped


def _install_markitdown(ui, summary: dict) -> None:
    """Install MarkItDown via pipx (preferred) or pip fallback."""
    pipx_cmd: str | None = None

    if shutil.which("pipx"):
        pipx_cmd = "pipx"
    elif shutil.which("pip"):
        print()
        ui.print_msg("pipx installs Python apps in isolated environments.", "info")
        ans = ui.confirm("Install pipx? (pip install --user pipx)", default=True)
        if ans:
            ui.print_msg("Installing pipx…", "info")
            r = subprocess.run(["pip", "install", "--user", "pipx"], capture_output=True, text=True, shell=_SHELL)
            if r.returncode == 0:
                ui.print_msg("pipx installed", "success")
                pipx_cmd = "python -m pipx"
            else:
                ui.print_msg("pipx install failed", "err")

    if pipx_cmd:
        ui.print_msg("Installing markitdown[all] via pipx…", "info")
        if pipx_cmd == "pipx":
            cmd = ["pipx", "install", "markitdown[all]"]
        else:
            cmd = ["python", "-m", "pipx", "install", "markitdown[all]"]
        r = subprocess.run(cmd, capture_output=True, text=True, shell=_SHELL)
        if r.returncode == 0:
            if not shutil.which("markitdown"):
                ui.print_msg("MarkItDown installed but not on PATH yet", "warn")
                ui.print_msg("Run: python -m pipx ensurepath  (then restart shell)", "info")
            else:
                ui.print_msg("MarkItDown installed", "success")
            summary["optional_installed"].append("markitdown")
        else:
            ui.print_msg("MarkItDown install failed", "err")
            summary["optional_failed"].append("markitdown")
    elif shutil.which("pip"):
        ui.print_msg("Installing markitdown[all] via pip…", "info")
        r = subprocess.run(["pip", "install", "markitdown[all]"], capture_output=True, text=True, shell=_SHELL)
        if r.returncode == 0:
            ui.print_msg("MarkItDown installed", "success")
            summary["optional_installed"].append("markitdown")
        else:
            ui.print_msg("MarkItDown install failed", "err")
            summary["optional_failed"].append("markitdown")
    else:
        ui.print_msg("Neither pipx nor pip found — cannot install MarkItDown", "err")
        summary["optional_failed"].append("markitdown")
