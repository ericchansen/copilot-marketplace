"""Step: Create shell aliases for disabled-by-default plugins."""

from __future__ import annotations

import os
import re
from pathlib import Path

from copilot_setup.models import SetupContext, StepResult
from copilot_setup.steps.plugins import PLUGINS
from lib.platform_ops import IS_WINDOWS

# Marker comments so we can detect and update our managed blocks
_BLOCK_START = "# >>> copilot-config managed: {alias} >>>"
_BLOCK_END = "# <<< copilot-config managed: {alias} <<<"

_PS_TEMPLATE = """\
{block_start}
function {alias} {{
    $configPath = Join-Path $env:USERPROFILE ".copilot" "config.json"
    if (-not (Test-Path -Path $configPath -PathType Leaf)) {{
        Write-Error "Copilot config not found at $configPath. Run: copilot plugin install {source}"
        return
    }}
    try {{
        $config = Get-Content $configPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    }} catch {{
        Write-Error "Failed to parse Copilot config at $configPath. Run setup again or reinstall the plugin."
        return
    }}
    $plugin = $config.installed_plugins | Where-Object {{ $_.name -eq "{name}" }}
    if (-not $plugin) {{
        Write-Error "{name} plugin not found. Install with: copilot plugin install {source}"
        return
    }}
    copilot --plugin-dir $plugin.cache_path @args
}}
{block_end}
"""

_BASH_TEMPLATE = """\
{block_start}
{alias}() {{
    local config_path="$HOME/.copilot/config.json"
    if [ ! -f "$config_path" ]; then
        echo "Error: Copilot config not found at $config_path. Run: copilot plugin install {source}" >&2
        return 1
    fi
    local _py
    for _py in python3 python py; do
        if command -v "$_py" >/dev/null 2>&1; then break; fi
        _py=""
    done
    if [ -z "$_py" ]; then
        echo "Error: Python not found. Install Python 3.10+ to use {alias}." >&2
        return 1
    fi
    local plugin_path
    plugin_path=$("$_py" -c "
import json, sys
config = json.load(open('$config_path'))
plugins = config.get('installed_plugins', [])
match = [p for p in plugins if p['name'] == '{name}']
print(match[0]['cache_path'] if match else '')
" 2>/dev/null)
    if [ -z "$plugin_path" ]; then
        echo "Error: {name} plugin not found. Install with: copilot plugin install {source}" >&2
        return 1
    fi
    copilot --plugin-dir "$plugin_path" "$@"
}}
{block_end}
"""

# Developer variant: point directly at the local clone
_PS_DEV_TEMPLATE = """\
{block_start}
function {alias} {{
    copilot --plugin-dir "{clone_path}" @args
}}
{block_end}
"""

_BASH_DEV_TEMPLATE = """\
{block_start}
{alias}() {{
    copilot --plugin-dir "{clone_path}" "$@"
}}
{block_end}
"""


def _profile_path_ps() -> Path | None:
    """Return the PowerShell profile path (CurrentUserCurrentHost)."""
    raw = os.environ.get("USERPROFILE")
    if not raw:
        return None
    # PowerShell 7+ (pwsh) profile location
    ps7 = Path(raw) / "Documents" / "PowerShell" / "Microsoft.PowerShell_profile.ps1"
    # Windows PowerShell 5.x profile location
    ps5 = Path(raw) / "Documents" / "WindowsPowerShell" / "Microsoft.PowerShell_profile.ps1"
    # Prefer whichever already exists; default to PS7
    if ps5.exists() and not ps7.exists():
        return ps5
    return ps7


def _profile_paths_unix() -> list[Path]:
    """Return candidate shell profile paths on Unix."""
    home = Path.home()
    candidates = []
    # Prefer zsh on macOS, bash elsewhere
    zshrc = home / ".zshrc"
    bashrc = home / ".bashrc"
    if zshrc.exists():
        candidates.append(zshrc)
    if bashrc.exists():
        candidates.append(bashrc)
    if not candidates:
        candidates.append(bashrc)  # Default to .bashrc
    return candidates


def _has_alias_block(content: str, alias: str) -> bool:
    """Check if the managed alias block already exists in the profile content."""
    start = _BLOCK_START.format(alias=alias)
    return start in content


def _remove_alias_block(content: str, alias: str) -> str:
    """Remove an existing managed alias block from profile content."""
    start = re.escape(_BLOCK_START.format(alias=alias))
    end = re.escape(_BLOCK_END.format(alias=alias))
    pattern = rf"\n?{start}.*?{end}\n?"
    return re.sub(pattern, "\n", content, flags=re.DOTALL)


def _append_alias(profile_path: Path, block: str) -> bool:
    """Append an alias block to a shell profile, creating it if needed."""
    try:
        profile_path.parent.mkdir(parents=True, exist_ok=True)

        content = profile_path.read_text("utf-8") if profile_path.exists() else ""
        # Remove old block if present (allows updates)
        alias_match = re.search(r"function (\S+)", block) or re.search(r"^(\S+)\(\)", block, re.MULTILINE)
        if alias_match:
            alias_name = alias_match.group(1)
            if _has_alias_block(content, alias_name):
                content = _remove_alias_block(content, alias_name)

        # Append new block
        if not content.endswith("\n"):
            content += "\n"
        content += block
        profile_path.write_text(content, "utf-8")
    except OSError:
        return False
    return True


class ShellAliasStep:
    """Create shell aliases for disabled-by-default plugins (e.g., copilot-msx)."""

    name = "Setup · Shell Aliases"

    def check(self, ctx: SetupContext) -> bool:
        # Only run when work plugins with aliases are included
        return any(p.get("alias") and (not p.get("work") or ctx.include_work) for p in PLUGINS)

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()

        alias_plugins = [p for p in PLUGINS if p.get("alias") and (not p.get("work") or ctx.include_work)]
        if not alias_plugins:
            return result

        for plugin in alias_plugins:
            alias = plugin["alias"]
            name = plugin["name"]
            source = plugin["source"]
            clone_path = ctx.local_clone_map.get(name)

            fmt = {
                "alias": alias,
                "name": name,
                "source": source,
                "block_start": _BLOCK_START.format(alias=alias),
                "block_end": _BLOCK_END.format(alias=alias),
            }

            if IS_WINDOWS:
                profile = _profile_path_ps()
                if not profile:
                    result.item(alias, "failed", "could not determine PowerShell profile path")
                    continue
                if clone_path:
                    block = _PS_DEV_TEMPLATE.format(**fmt, clone_path=str(clone_path))
                else:
                    block = _PS_TEMPLATE.format(**fmt)
                if _append_alias(profile, block):
                    result.item(alias, "created", f"alias added to {profile.name}")
                else:
                    result.item(alias, "failed", f"could not write to {profile}")
            else:
                profiles = _profile_paths_unix()
                if clone_path:
                    block = _BASH_DEV_TEMPLATE.format(**fmt, clone_path=str(clone_path))
                else:
                    block = _BASH_TEMPLATE.format(**fmt)
                wrote = [p for p in profiles if _append_alias(p, block)]
                failed = [p for p in profiles if p not in wrote]
                if wrote:
                    result.item(alias, "created", f"alias added to {', '.join(p.name for p in wrote)}")
                if failed:
                    result.item(alias, "failed", f"could not write to {', '.join(str(p) for p in failed)}")

        return result
