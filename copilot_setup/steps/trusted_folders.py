"""Step: Add repo root to trusted_folders in config.json."""

from __future__ import annotations

import json
from pathlib import Path

from copilot_setup.models import SetupContext, StepResult


class TrustedFoldersStep:
    """Ensure the repo root is in ``config.json``'s ``trusted_folders`` list."""

    name = "Setup · Trusted Folders"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()

        try:
            config_obj = json.loads(ctx.config_json.read_text("utf-8")) if ctx.config_json.exists() else {}
        except json.JSONDecodeError:
            result.item("config.json", "warn", "invalid JSON — treating as empty")
            config_obj = {}

        trusted: list[str] = config_obj.get("trusted_folders", [])
        resolved_root = str(ctx.repo_root.resolve())
        already_trusted = any(str(Path(f).resolve()) == resolved_root for f in trusted)

        if not already_trusted:
            trusted.append(resolved_root)
            config_obj["trusted_folders"] = trusted
            ctx.config_json.write_text(json.dumps(config_obj, indent=2) + "\n", "utf-8")
            result.item(resolved_root, "created", "added to trusted_folders")
        else:
            result.item("Repo", "exists", "already in trusted_folders")

        return result
