# AGENTS.md — copilot-config

## Repository Purpose

Personal configuration source for copilot-setup. Contains MCP servers, LSP servers,
skills, instructions, and portable settings. This is a **data-only** repo — no code.

## Structure

- `.copilot/mcp.json` — Personal MCP servers (additive merge with other sources)
- `.copilot/lsp-servers.json` — LSP server definitions (first-wins)
- `.copilot/config.portable.json` — Portable Copilot settings (first-wins)
- `.copilot/copilot-instructions.md` — Global instructions (first-wins)
- `.copilot/skills/` — Each subdirectory is a skill with SKILL.md

## Adding Content

- **New MCP server**: Add to `mcpServers` in `.copilot/mcp.json`
- **New skill**: Create `.copilot/skills/{name}/SKILL.md` with YAML frontmatter
- **Settings**: Edit `.copilot/config.portable.json` for model, theme, etc.
- **Instructions**: Edit `.copilot/copilot-instructions.md` for global behavior
