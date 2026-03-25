"""Shared test fixtures for the copilot_setup test suite."""

from __future__ import annotations

import argparse
from pathlib import Path

import pytest

from copilot_setup.models import SetupContext


@pytest.fixture
def tmp_repo(tmp_path: Path) -> Path:
    """Create a minimal repo structure in a temp dir."""
    repo = tmp_path / "repo"
    copilot_dir = repo / ".copilot"
    skills_dir = copilot_dir / "skills"
    skills_dir.mkdir(parents=True)
    (repo / "external").mkdir()
    (repo / "mcp-servers.json").write_text('{"servers": []}', "utf-8")
    (repo / "lsp-servers.json").write_text('{"lspServers": {}}', "utf-8")
    (copilot_dir / "config.portable.json").write_text("{}", "utf-8")
    return repo


@pytest.fixture
def copilot_home(tmp_path: Path) -> Path:
    """Create a temp ~/.copilot directory."""
    home = tmp_path / ".copilot"
    home.mkdir()
    (home / "skills").mkdir()
    return home


@pytest.fixture
def default_args() -> argparse.Namespace:
    """CLI args with sensible defaults for testing."""
    return argparse.Namespace(
        work=False,
        non_interactive=True,
        clean_orphans=False,
        skip_session=False,
        command="setup",
    )


@pytest.fixture
def setup_ctx(tmp_repo: Path, copilot_home: Path, default_args: argparse.Namespace) -> SetupContext:
    """A fully wired SetupContext pointing at temp directories."""
    return SetupContext(
        repo_root=tmp_repo,
        copilot_home=copilot_home,
        config_json=copilot_home / "config.json",
        external_dir=tmp_repo / "external",
        repo_copilot=tmp_repo / ".copilot",
        repo_skills=tmp_repo / ".copilot" / "skills",
        mcp_servers_json=tmp_repo / "mcp-servers.json",
        lsp_servers_json=tmp_repo / "lsp-servers.json",
        portable_json=tmp_repo / ".copilot" / "config.portable.json",
        args=default_args,
        non_interactive=True,
    )
