# AGENTS.md — copilot-config

## Repository Purpose

A **Copilot CLI plugin** providing personal skills, MCP servers, and LSP servers.

```bash
copilot plugin marketplace add ericchansen/copilot-config
copilot plugin install copilot-config@ericchansen-plugins
```

## Plugin Structure

```
plugin.json          — Plugin manifest (name, version, component paths)
.mcp.json            — MCP server definitions (Azure, Context7, Playwright, etc.)
lsp.json             — LSP server definitions (TypeScript, Python, Rust)
skills/              — Each subdirectory is a skill with SKILL.md
extras/              — Non-plugin files (instructions, settings) for manual install
LICENSE              — MIT
```

## Adding Content

- **New skill**: Create `skills/{name}/SKILL.md` with YAML frontmatter (`name`, `description`, `license`, `allowed-tools`)
- **New MCP server**: Add to `mcpServers` in `.mcp.json`
- **New LSP server**: Add to `lspServers` in `lsp.json`
- **Version bump**: Update `version` in `plugin.json`, tag, push

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
