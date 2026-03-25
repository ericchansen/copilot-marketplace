"""Step: Symlink tracked config files into ~/.copilot/."""

from __future__ import annotations

from typing import ClassVar

from copilot_setup.models import SetupContext, StepResult
from lib.platform_ops import create_file_link


class ConfigLinksStep:
    """Create symlinks for tracked config files (e.g., copilot-instructions.md)."""

    name = "Setup · Config Symlinks"

    # Config files to link: name is the filename in ~/.copilot/,
    # target (optional) overrides the source filename in the repo.
    CONFIG_FILE_LINKS: ClassVar[list[dict[str, str]]] = [
        {"name": "copilot-instructions.md"},
    ]

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()

        for cfg in self.CONFIG_FILE_LINKS:
            source_name = cfg.get("target", cfg["name"])
            target_path = ctx.repo_copilot / source_name
            link_path = ctx.copilot_home / cfg["name"]

            if not target_path.exists():
                result.item(cfg["name"], "warn", "source not found in repo")
                continue

            status = create_file_link(link_path, target_path, not ctx.non_interactive)
            if status == "created":
                result.item(cfg["name"], "created", "linked")
            elif status == "copied":
                result.item(cfg["name"], "warn", "copied (symlinks need Developer Mode)")
            elif status == "exists":
                result.item(cfg["name"], "exists", "already linked")
            elif status == "skipped":
                result.item(cfg["name"], "skipped", "user declined")
            else:
                result.item(cfg["name"], "failed", "could not create symlink")

        return result
