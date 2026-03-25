"""UI rendering module for Copilot CLI setup tool.

Provides a UI class that handles ALL visual output. Functional code calls
UI methods to report what happened; the UI decides how to display it.
"""

from __future__ import annotations

import os
import time
import unicodedata
from typing import ClassVar

# Enable ANSI escape codes on Windows Terminal
os.system("")

# ── ANSI color constants ────────────────────────────────────────────────────

CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
GRAY = "\033[90m"
BOLD = "\033[1m"
RESET = "\033[0m"


def _visual_width(text: str) -> int:
    """Return the number of terminal columns *text* occupies.

    Emoji and East Asian wide characters take 2 columns; most other
    printable characters take 1.  ANSI escape sequences are ignored.
    """
    width = 0
    in_escape = False
    for ch in text:
        if in_escape:
            if ch == "m":
                in_escape = False
            continue
        if ch == "\033":
            in_escape = True
            continue
        eaw = unicodedata.east_asian_width(ch)
        if eaw in ("W", "F"):
            width += 2
        else:
            width += 1
    return width


class UI:
    """Handles all visual output for the setup tool."""

    def __init__(self, step_names: list[str]) -> None:
        self.step_names = step_names
        self.total_steps = len(step_names)
        self.step_index = 0
        self.step_start: float = 0.0
        self.step_name: str = ""
        self.items: list[tuple[str, str, str]] = []  # (name, status, detail)
        self.header_printed = False
        self._step_active = False

    # ── Step lifecycle ──────────────────────────────────────────────────────

    def step(self, name: str) -> None:
        """Start a new step. Auto-ends the previous step if one is active."""
        if self._step_active:
            self.end_step()
        self.step_index += 1
        self.step_name = name
        self.step_start = time.time()
        self.items = []
        self.header_printed = False
        self._step_active = True

    def item(self, name: str, status: str, detail: str = "") -> None:
        """Buffer an item. Statuses: created, exists, skipped, failed, warn, info, success."""
        self.items.append((name, status, detail))

    def end_step(self) -> None:
        """Flush buffered items according to display rules."""
        if not self._step_active:
            return

        elapsed = time.time() - self.step_start

        # Empty step with no prior output → skip entirely
        if not self.items and not self.header_printed:
            self._step_active = False
            return

        # Lazy-print header now that we know there's content
        if not self.header_printed:
            self._print_step_header(elapsed)

        # ── Group items by display category ─────────────────────────────
        success = [(n, s, d) for n, s, d in self.items if s in ("created", "success")]
        passive = [(n, s, d) for n, s, d in self.items if s in ("exists", "info")]
        alerts = [(n, s, d) for n, s, d in self.items if s in ("failed", "warn", "skipped")]

        # Show success/created individually in green
        for name, status, detail in success:
            self._render_item(name, status, detail)

        # Collapse passive items — sub-group by actual status for labelling
        exists_group = [i for i in passive if i[1] == "exists"]
        info_group = [i for i in passive if i[1] == "info"]

        for group, label in [(exists_group, "already linked"), (info_group, "info")]:
            if not group:
                continue
            if len(group) == 1:
                self._render_item_dim(group[0][0], group[0][2])
            else:
                print(f"    {GRAY}ℹ\ufe0e {len(group)} {label}{RESET}")

        # Show failed/warn/skipped individually (never collapse)
        for name, status, detail in alerts:
            self._render_item(name, status, detail)

        self._step_active = False

    # ── Step header (lazy) ──────────────────────────────────────────────────

    def _print_step_header(self, elapsed: float | None = None) -> None:
        """Print the step header line. Elapsed is included only when known."""
        prefix = f"  [{self.step_index}/{self.total_steps}]"
        suffix = f" ({elapsed:.1f}s) " if elapsed is not None else " "
        visible_len = len(prefix) + 1 + len(self.step_name) + len(suffix)
        dash_count = max(2, 50 - visible_len)
        print(f"{CYAN}{prefix}{RESET} {CYAN}{self.step_name}{RESET}{GRAY}{suffix}{'─' * dash_count}{RESET}")
        self.header_printed = True

    # ── Item renderers ──────────────────────────────────────────────────────

    _ICONS: ClassVar[dict[str, str]] = {
        "created": f"{GREEN}✓{RESET}",
        "success": f"{GREEN}✓{RESET}",
        "exists": f"{GRAY}ℹ\ufe0e{RESET}",
        "info": f"{CYAN}ℹ\ufe0e{RESET}",
        "failed": f"{RED}✗{RESET}",
        "warn": f"{YELLOW}⚠\ufe0e{RESET}",
        "skipped": f"{YELLOW}⚠\ufe0e{RESET}",
    }

    def _render_item(self, name: str, status: str, detail: str) -> None:
        icon = self._ICONS.get(status, "?")
        suffix = f" — {detail}" if detail else ""
        print(f"    {icon} {name}{suffix}")

    @staticmethod
    def _render_item_dim(name: str, detail: str) -> None:
        suffix = f" — {detail}" if detail else ""
        print(f"    {GRAY}ℹ\ufe0e {name}{suffix}{RESET}")

    # ── Immediate output (not buffered) ─────────────────────────────────────

    def print_msg(self, msg: str, status: str) -> None:
        """Print immediately. Triggers lazy step header if needed."""
        if self._step_active and not self.header_printed:
            self._print_step_header()

        formats = {
            "success": f"    {GREEN}✓{RESET} {msg}",
            "info": f"    {CYAN}ℹ\ufe0e{RESET} {msg}",
            "warn": f"    {YELLOW}⚠\ufe0e{RESET} {msg}",
            "err": f"    {RED}✗{RESET} {msg}",
            "dim": f"    {GRAY}{msg}{RESET}",
        }
        print(formats.get(status, f"    {msg}"))

    # ── Decorative output ───────────────────────────────────────────────────

    def header(self, text: str) -> None:
        """Box-drawn header with ╭╮╰╯ borders."""
        inner = _visual_width(text) + 4  # 2 spaces padding each side
        print(f"{CYAN}╭{'─' * inner}╮{RESET}")
        # Pad the content line to match: │  text  │
        # The text may contain wide chars, so pad with spaces to fill
        pad_right = inner - _visual_width(text) - 2  # 2 for left padding
        print(f"{CYAN}│{RESET}  {BOLD}{text}{RESET}{' ' * pad_right}{CYAN}│{RESET}")
        print(f"{CYAN}╰{'─' * inner}╯{RESET}")

    def section(self, text: str) -> None:
        """Centered divider ─── text ───."""
        print(f"\n{CYAN}─── {text} ───{RESET}\n")

    # ── Input ───────────────────────────────────────────────────────────────

    def prompt(self, msg: str, default: str = "") -> str:
        """Input prompt with [default] hint. Returns user input or default."""
        hint = f" [{default}]" if default else ""
        try:
            response = input(f"  {msg}{hint}: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return default
        return response or default

    def confirm(self, msg: str, default: bool = False) -> bool:
        """Yes/no prompt showing [y/N] or [Y/n] based on default."""
        hint = "[Y/n]" if default else "[y/N]"
        try:
            response = input(f"  {msg} {hint}: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return default
        if not response:
            return default
        return response in ("y", "yes")

    # ── Summary table ───────────────────────────────────────────────────────

    def summary(self, data: dict, enabled_servers: list) -> None:
        """Box-drawn summary table with ┌┐├┤└┘┬┴│─ borders."""
        rows = self._build_summary_rows(data, enabled_servers)
        if not rows:
            return

        label_w = max(len(r[0]) for r in rows)
        value_w = max(len(r[1]) for r in rows)
        min_value_w = 23
        if value_w < min_value_w:
            value_w = min_value_w
        left_col = label_w + 2  # padding on each side of label
        right_col = value_w + 2  # padding on each side of value
        full_inner = left_col + 1 + right_col  # +1 for middle separator

        title = "✨  Setup Complete"
        title_visual_len = _visual_width(title)
        min_inner = title_visual_len + 4  # at least 2 spaces padding each side
        if full_inner < min_inner:
            right_col += min_inner - full_inner
            value_w = right_col - 2
            full_inner = left_col + 1 + right_col

        pad_total = full_inner - title_visual_len
        pad_left = pad_total // 2
        pad_right = pad_total - pad_left

        print()
        print(f"  {CYAN}┌{'─' * full_inner}┐{RESET}")
        print(f"  {CYAN}│{RESET}{' ' * pad_left}{title}{' ' * pad_right}{CYAN}│{RESET}")
        print(f"  {CYAN}├{'─' * left_col}┬{'─' * right_col}┤{RESET}")
        for label, value in rows:
            print(f"  {CYAN}│{RESET} {label:<{label_w}} {CYAN}│{RESET} {value:<{value_w}} {CYAN}│{RESET}")
        print(f"  {CYAN}└{'─' * left_col}┴{'─' * right_col}┘{RESET}")
        print()

    def _build_summary_rows(
        self,
        data: dict,
        enabled_servers: list,
    ) -> list[tuple[str, str]]:
        rows: list[tuple[str, str]] = []

        if data.get("backed_up"):
            rows.append(("Backup", data.get("backup_dir", "config backed up")))

        cfg_parts: list[str] = []
        if data.get("config_files_linked"):
            cfg_parts.append(f"{len(data['config_files_linked'])} linked")
        if data.get("config_patched"):
            cfg_parts.append("patched")
        if data.get("trusted_folder_added"):
            cfg_parts.append("trusted folder added")
        if data.get("config_files_skipped"):
            cfg_parts.append(f"{len(data['config_files_skipped'])} skipped")
        if cfg_parts:
            rows.append(("Config", ", ".join(cfg_parts)))

        skill_parts: list[str] = []
        if data.get("skills_created"):
            skill_parts.append(f"{len(data['skills_created'])} created")
        if data.get("skills_existed"):
            skill_parts.append(f"{len(data['skills_existed'])} linked")
        if data.get("skills_skipped"):
            skill_parts.append(f"{len(data['skills_skipped'])} skipped")
        if data.get("skills_failed"):
            skill_parts.append(f"{len(data['skills_failed'])} failed")
        if skill_parts:
            rows.append(("Skills", ", ".join(skill_parts)))

        mcp_parts: list[str] = []
        if data.get("mcp_config_generated"):
            mcp_parts.append(f"{data.get('mcp_server_count', len(enabled_servers))} configured")
        if data.get("mcp_servers_built"):
            mcp_parts.append(f"{len(data['mcp_servers_built'])} built")
        if data.get("mcp_servers_failed"):
            mcp_parts.append(f"{len(data['mcp_servers_failed'])} failed")
        if data.get("mcp_env_missing"):
            mcp_parts.append(f"{len(data['mcp_env_missing'])} env missing")
        if mcp_parts:
            rows.append(("MCP servers", ", ".join(mcp_parts)))

        lsp_parts: list[str] = []
        if data.get("lsp_count"):
            lsp_parts.append(f"{data['lsp_count']} configured")
        if data.get("lsp_skipped"):
            lsp_parts.append(f"{len(data['lsp_skipped'])} unavailable")
        if lsp_parts:
            rows.append(("LSP servers", ", ".join(lsp_parts)))

        plug_parts: list[str] = []
        if data.get("plugins_installed"):
            plug_parts.append(f"{len(data['plugins_installed'])} installed")
        if data.get("plugins_updated"):
            plug_parts.append(f"{len(data['plugins_updated'])} updated")
        if data.get("plugins_skipped"):
            plug_parts.append(f"{len(data['plugins_skipped'])} current")
        if data.get("plugins_failed"):
            plug_parts.append(f"{len(data['plugins_failed'])} failed")
        if plug_parts:
            rows.append(("Plugins", ", ".join(plug_parts)))

        if data.get("plugin_junctions_cleaned"):
            rows.append(("Legacy", f"{data['plugin_junctions_cleaned']} junctions removed"))

        opt_parts: list[str] = []
        if data.get("optional_installed"):
            opt_parts.append(f"{len(data['optional_installed'])} installed")
        if data.get("optional_skipped"):
            opt_parts.append(f"{len(data['optional_skipped'])} skipped")
        if data.get("optional_failed"):
            opt_parts.append(f"{len(data['optional_failed'])} failed")
        if opt_parts:
            rows.append(("Optional", ", ".join(opt_parts)))

        return rows
