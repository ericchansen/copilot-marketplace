"""Step implementations for the setup pipeline.

Import all steps here for convenient access from the runner.
"""

from copilot_setup.steps.backup import BackupStep
from copilot_setup.steps.config_links import ConfigLinksStep
from copilot_setup.steps.config_patch import ConfigPatchStep
from copilot_setup.steps.directories import DirectoriesStep
from copilot_setup.steps.git_auth import GitAuthStep
from copilot_setup.steps.legacy_cleanup import LegacyCleanupStep
from copilot_setup.steps.lsp_config import LspConfigStep
from copilot_setup.steps.mcp_build import McpBuildStep
from copilot_setup.steps.mcp_config import McpConfigStep
from copilot_setup.steps.mcp_env import McpEnvStep
from copilot_setup.steps.plugin_update import PluginUpdateStep
from copilot_setup.steps.plugins import PluginsStep
from copilot_setup.steps.shell_alias import ShellAliasStep
from copilot_setup.steps.skills import SkillsStep
from copilot_setup.steps.stale_cleanup import StaleCleanupStep
from copilot_setup.steps.trusted_folders import TrustedFoldersStep

# Ordered list of all setup steps — matches the original _run_setup() flow.
ALL_STEPS = [
    GitAuthStep(),
    BackupStep(),
    DirectoriesStep(),
    ConfigLinksStep(),
    ConfigPatchStep(),
    TrustedFoldersStep(),
    SkillsStep(),
    LegacyCleanupStep(),
    PluginsStep(),
    PluginUpdateStep(),
    ShellAliasStep(),
    McpBuildStep(),
    McpEnvStep(),
    McpConfigStep(),
    LspConfigStep(),
    StaleCleanupStep(),
]

__all__ = [
    "ALL_STEPS",
    "BackupStep",
    "ConfigLinksStep",
    "ConfigPatchStep",
    "DirectoriesStep",
    "GitAuthStep",
    "LegacyCleanupStep",
    "LspConfigStep",
    "McpBuildStep",
    "McpConfigStep",
    "McpEnvStep",
    "PluginUpdateStep",
    "PluginsStep",
    "ShellAliasStep",
    "SkillsStep",
    "StaleCleanupStep",
    "TrustedFoldersStep",
]
