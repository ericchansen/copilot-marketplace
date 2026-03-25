"""Step: Merge portable settings into config.json."""

from __future__ import annotations

from copilot_setup.models import SetupContext, StepResult
from lib.config import patch_config_json

# Keys allowed to be copied from config.portable.json → config.json
PORTABLE_ALLOWED_KEYS = [
    "banner",
    "model",
    "render_markdown",
    "theme",
    "experimental",
    "reasoning_effort",
]


class ConfigPatchStep:
    """Patch ``~/.copilot/config.json`` with portable settings."""

    name = "Setup · Patch config.json"

    def check(self, ctx: SetupContext) -> bool:
        return True

    def run(self, ctx: SetupContext) -> StepResult:
        result = StepResult()
        patched = patch_config_json(ctx.config_json, ctx.portable_json, PORTABLE_ALLOWED_KEYS)
        if patched:
            result.item("config.json", "success", "patched with portable settings")
        else:
            result.item("config.portable.json", "warn", "not found — skipping patch")
        return result
