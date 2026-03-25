"""Typed data models for the setup pipeline.

Replaces the untyped ``summary`` dict and loose variables with structured,
IDE-friendly dataclasses.  Every step receives a :class:`SetupContext` and
returns a :class:`StepResult`.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal


# ---------------------------------------------------------------------------
# Item-level result (one action within a step)
# ---------------------------------------------------------------------------

Status = Literal["created", "exists", "copied", "skipped", "failed", "success", "info", "warn"]


@dataclass
class ItemResult:
    """Outcome of a single action within a step (e.g., one symlink created)."""

    name: str
    status: Status
    detail: str = ""


# ---------------------------------------------------------------------------
# Step-level result
# ---------------------------------------------------------------------------

StepStatus = Literal["ok", "skipped", "warn", "failed"]


@dataclass
class StepResult:
    """Aggregate outcome of one setup step."""

    status: StepStatus = "ok"
    items: list[ItemResult] = field(default_factory=list)
    message: str = ""

    # Convenience builders
    def item(self, name: str, status: Status, detail: str = "") -> ItemResult:
        """Add an item and return it."""
        it = ItemResult(name, status, detail)
        self.items.append(it)
        return it

    @property
    def has_failures(self) -> bool:
        return any(i.status == "failed" for i in self.items)

    @property
    def created(self) -> list[ItemResult]:
        return [i for i in self.items if i.status == "created"]

    @property
    def failed(self) -> list[ItemResult]:
        return [i for i in self.items if i.status == "failed"]


# ---------------------------------------------------------------------------
# Git auth state
# ---------------------------------------------------------------------------


@dataclass
class GitAuthState:
    """Detected Git/GitHub authentication capabilities."""

    gh_available: bool = False
    ssh_available: bool = False
    prefer_ssh: bool = False


# ---------------------------------------------------------------------------
# Setup context — shared state passed to every step
# ---------------------------------------------------------------------------


@dataclass
class SetupContext:
    """Immutable-ish bag of paths, flags, and shared state for the pipeline.

    Created once at the start of setup and threaded through every step.
    Steps may mutate ``local_clone_map`` and ``plugin_managed_names``
    for downstream steps to consume.
    """

    # Paths
    repo_root: Path
    copilot_home: Path
    config_json: Path
    external_dir: Path
    repo_copilot: Path
    repo_skills: Path
    mcp_servers_json: Path
    lsp_servers_json: Path
    portable_json: Path

    # CLI flags
    args: argparse.Namespace

    # Derived flags (set during preflight)
    include_work: bool = False
    include_clean_orphans: bool = False
    non_interactive: bool = False

    # Auth (set by git_auth step)
    auth_state: GitAuthState = field(default_factory=GitAuthState)

    # Cross-step shared state (populated by steps for downstream consumers)
    local_clone_map: dict[str, Path] = field(default_factory=dict)
    plugin_managed_names: set[str] = field(default_factory=set)
    plugin_server_names: set[str] = field(default_factory=set)
    plugins_to_install: list[dict] = field(default_factory=list)
    enabled_servers: list[dict] = field(default_factory=list)
    mcp_paths: dict[str, str] = field(default_factory=dict)
    local_skills: list[dict] = field(default_factory=list)

    @property
    def copilot_skills(self) -> Path:
        return self.copilot_home / "skills"


# ---------------------------------------------------------------------------
# Summary — typed replacement for the 27-key dict
# ---------------------------------------------------------------------------


@dataclass
class Summary:
    """Collects results from all steps for final reporting."""

    steps: dict[str, StepResult] = field(default_factory=dict)

    def record(self, step_name: str, result: StepResult) -> None:
        """Record a step's result."""
        self.steps[step_name] = result

    @property
    def has_failures(self) -> bool:
        return any(r.has_failures for r in self.steps.values())

    @property
    def all_items(self) -> list[ItemResult]:
        """Flatten all items across all steps."""
        return [item for r in self.steps.values() for item in r.items]

    def items_by_status(self, status: Status) -> list[ItemResult]:
        return [i for i in self.all_items if i.status == status]

    def step_items(self, step_name: str) -> list[ItemResult]:
        """Get items for a specific step."""
        result = self.steps.get(step_name)
        return result.items if result else []
