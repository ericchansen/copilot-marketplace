"""Verify that plugin_server_names is derived from install outcomes, not intent."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from unittest.mock import patch

from copilot_setup.models import SetupContext
from copilot_setup.steps.plugins import PluginsStep


def _make_ctx(tmp_path: Path) -> SetupContext:
    """Build a SetupContext that reads mcp-servers.json from a temp copy with defaultPaths cleared."""
    root = Path(__file__).resolve().parent.parent

    # Copy mcp-servers.json with defaultPaths cleared so no local clone is detected
    real_data = json.loads((root / "mcp-servers.json").read_text("utf-8"))
    for s in real_data["servers"]:
        s["defaultPaths"] = []
    tmp_mcp = tmp_path / "mcp-servers.json"
    tmp_mcp.write_text(json.dumps(real_data), "utf-8")

    args = argparse.Namespace(work=True, clean_orphans=False, non_interactive=True)
    return SetupContext(
        repo_root=root,
        copilot_home=Path.home() / ".copilot",
        config_json=Path.home() / ".copilot" / "config.json",
        external_dir=root / "external",
        repo_copilot=root / ".copilot",
        repo_skills=root / ".copilot" / "skills",
        mcp_servers_json=tmp_mcp,
        lsp_servers_json=root / "lsp-servers.json",
        portable_json=root / ".copilot" / "config.portable.json",
        args=args,
        include_work=True,
    )


def _mcp_data_no_defaults() -> str:
    """Return mcp-servers.json content with defaultPaths cleared so no local clone is found."""
    root = Path(__file__).resolve().parent.parent
    data = json.loads((root / "mcp-servers.json").read_text("utf-8"))
    for s in data["servers"]:
        s["defaultPaths"] = []
    return json.dumps(data)


def test_empty_when_copilot_cli_missing(tmp_path: Path):
    """copilot not on PATH, no local clone → empty set."""
    ctx = _make_ctx(tmp_path)
    with (
        patch("lib.skills.shutil.which", return_value=None),
        patch("copilot_setup.steps.plugins.link_local_plugins"),
    ):
        PluginsStep().run(ctx)
    assert ctx.plugin_server_names == set()


def test_empty_when_install_fails(tmp_path: Path):
    """copilot available but install returns None → failed → empty set."""
    ctx = _make_ctx(tmp_path)

    def _fake(args, *, check=True):
        if args == ["plugin", "list"]:
            return ""
        return None  # install fails

    with (
        patch("lib.skills.shutil.which", return_value="/usr/bin/copilot"),
        patch("lib.skills._run_copilot", side_effect=_fake),
        patch("copilot_setup.steps.plugins.link_local_plugins"),
    ):
        PluginsStep().run(ctx)
    assert ctx.plugin_server_names == set()


def test_present_when_already_installed(tmp_path: Path):
    """Plugin shows up in 'copilot plugin list' → skipped → in the set."""
    ctx = _make_ctx(tmp_path)

    def _fake(args, *, check=True):
        if args == ["plugin", "list"]:
            return "msx-mcp    mcaps-microsoft/MSX-MCP    1.0.0"
        return "ok"

    with (
        patch("lib.skills.shutil.which", return_value="/usr/bin/copilot"),
        patch("lib.skills._run_copilot", side_effect=_fake),
        patch("copilot_setup.steps.plugins.link_local_plugins"),
    ):
        PluginsStep().run(ctx)
    assert ctx.plugin_server_names == {"msx-mcp"}


def test_present_when_fresh_install_succeeds(tmp_path: Path):
    """Plugin not present, install succeeds → in the set."""
    ctx = _make_ctx(tmp_path)

    def _fake(args, *, check=True):
        if args == ["plugin", "list"]:
            return ""
        return "installed"

    with (
        patch("lib.skills.shutil.which", return_value="/usr/bin/copilot"),
        patch("lib.skills._run_copilot", side_effect=_fake),
        patch("copilot_setup.steps.plugins.link_local_plugins"),
    ):
        PluginsStep().run(ctx)
    assert ctx.plugin_server_names == {"msx-mcp"}


def test_present_when_local_clone_exists(tmp_path: Path):
    """Local clone detected → in the set even if copilot CLI is missing."""
    # Build a ctx with defaultPaths pointing at a fake clone
    root = Path(__file__).resolve().parent.parent
    real_data = json.loads((root / "mcp-servers.json").read_text("utf-8"))
    clone = tmp_path / "MSX-MCP"
    clone.mkdir()
    (clone / ".git").mkdir()
    (clone / "dist").mkdir()
    (clone / "dist" / "index.js").write_text("// stub")
    for s in real_data["servers"]:
        if s["name"] == "msx-mcp":
            s["defaultPaths"] = [str(clone)]
        else:
            s["defaultPaths"] = []
    tmp_mcp = tmp_path / "mcp-servers.json"
    tmp_mcp.write_text(json.dumps(real_data), "utf-8")

    args = argparse.Namespace(work=True, clean_orphans=False, non_interactive=True)
    ctx = SetupContext(
        repo_root=root,
        copilot_home=Path.home() / ".copilot",
        config_json=Path.home() / ".copilot" / "config.json",
        external_dir=root / "external",
        repo_copilot=root / ".copilot",
        repo_skills=root / ".copilot" / "skills",
        mcp_servers_json=tmp_mcp,
        lsp_servers_json=root / "lsp-servers.json",
        portable_json=root / ".copilot" / "config.portable.json",
        args=args,
        include_work=True,
    )

    with (
        patch("lib.skills.shutil.which", return_value=None),
        patch("copilot_setup.steps.plugins.link_local_plugins"),
    ):
        PluginsStep().run(ctx)
    assert ctx.plugin_server_names == {"msx-mcp"}
    assert "msx-mcp" in ctx.local_clone_map


if __name__ == "__main__":
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        test_empty_when_copilot_cli_missing(tmp)
        print("PASS: empty when copilot CLI missing")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        test_empty_when_install_fails(tmp)
        print("PASS: empty when install fails")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        test_present_when_already_installed(tmp)
        print("PASS: present when already installed")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        test_present_when_fresh_install_succeeds(tmp)
        print("PASS: present when fresh install succeeds")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        test_present_when_local_clone_exists(tmp)
        print("PASS: present when local clone exists")

    print("\nAll 5 scenarios passed!")
