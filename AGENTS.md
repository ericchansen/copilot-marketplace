# AGENTS.md — copilot-marketplace (personal)

## Repository Purpose

A **Copilot CLI marketplace** of personal plugins. Each skill is its own
independently installable plugin.

```bash
copilot plugin marketplace add ericchansen/copilot-marketplace
copilot plugin install doc-generator@copilot-marketplace
```

MCP and LSP servers are **not** bundled here — they are defined once in synced
user config (`~/.copilot/mcp-config.json`, `~/.copilot/lsp-config.json`).

## Repository Structure

```
.github/plugin/marketplace.json   — Marketplace manifest (name: copilot-marketplace, one entry per plugin)
plugins/<name>/
  plugin.json                     — Plugin manifest (name, version, component paths)
  skills/<name>/SKILL.md          — Skill definition with YAML frontmatter (+ any helper files)
copilot-home/                     — Portable user-level config deployed to ~/.copilot via link.ps1
  settings.json                     home profile: prefs + marketplace + enabledPlugins
  mcp-config.json                   general dev MCP servers
  lsp-config.json                   LSP servers (typescript, python, rust)
  link.ps1                          deploys the config (symlink + merge-aware settings)
  copilot-instructions.md           global custom instructions
AGENTS.md, README.md, LICENSE
```

## Adding a Plugin

1. Create `plugins/{name}/plugin.json` (`name`, `version`, `"skills": "skills/"`).
2. Create `plugins/{name}/skills/{name}/SKILL.md` with YAML frontmatter
   (`name`, `description`, `license`, `allowed-tools`); add any helper files alongside it.
3. Add an entry to `.github/plugin/marketplace.json` (`name`, `source: plugins/{name}`, `description`, `version`).

## Skill YAML Frontmatter

Every `SKILL.md` must have:

```yaml
---
name: my-skill
description: 'Brief description with trigger words'
license: MIT
allowed-tools: Bash, PowerShell
---
```

## Releases

`version` is per plugin in each `plugins/<name>/plugin.json`. The repo-level tag
(`vX.Y.Z`) must match `metadata.version` in `marketplace.json` (enforced by the
Release workflow). Bump, tag, and push to publish.

## Formatting

File formatting is enforced by [editorconfig-checker](https://github.com/editorconfig-checker/editorconfig-checker)
against `.editorconfig` (the `Lint` workflow). Run it locally with `npx editorconfig-checker`.
Indentation enforcement is disabled in `.editorconfig-checker.json`; line endings are
normalized to LF via `.gitattributes`.
