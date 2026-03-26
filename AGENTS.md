# AGENTS.md — copilot-config

## Repository Purpose

Personal configuration source for copilot-setup. Contains MCP servers, LSP servers,
skills, instructions, and portable settings. This is a **data-only** repo — no code.

## Structure

- `mcp-servers.json` — Personal MCP servers (additive merge with other sources)
- `lsp-servers.json` — LSP server definitions (first-wins)
- `config.portable.json` — Portable Copilot settings (first-wins)
- `copilot-instructions.md` — Global instructions (first-wins)
- `skills/` — Each subdirectory is a skill with SKILL.md

## Adding Content

- **New MCP server**: Add to `servers` array in `mcp-servers.json`
- **New skill**: Create `skills/{name}/SKILL.md` with YAML frontmatter
- **Settings**: Edit `config.portable.json` for model, theme, etc.
- **Instructions**: Edit `copilot-instructions.md` for global behavior
