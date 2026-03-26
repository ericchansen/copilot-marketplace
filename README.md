# copilot-config

Personal configuration source for [copilot-setup](https://github.com/ericchansen/copilot-setup).

## Contents

| File | Purpose |
|------|---------|
| `mcp-servers.json` | MCP server definitions (Azure, Context7, Playwright, etc.) |
| `lsp-servers.json` | LSP server definitions (TypeScript, Python, Rust) |
| `config.portable.json` | Portable Copilot settings (model, theme, etc.) |
| `copilot-instructions.md` | Global Copilot instructions |
| `skills/` | Personal/generic skills (9 skills) |

## Usage

Register this as a config source in `~/.copilot/config-sources.json`:

```json
[
  {"name": "personal", "path": "~/repos/copilot-config"}
]
```

Then run `copilot-setup` — it discovers, merges, and deploys everything.

## Skills

| Skill | Purpose |
|-------|---------|
| clean | Post-merge git cleanup |
| edge-browser | Launch Edge for browser collaboration |
| gh-body-safe | Safe `gh` commands with `--body-file` |
| git-commit | Conventional commit message generation |
| git-safety-scan | Pre-push secret/PII scanning |
| mcp-reauth | MCP server OAuth token management |
| pr-review-address | Address PR review feedback |
| release-announce | Draft release announcements for Teams |
| summon-the-knights-of-the-round-table | Multi-model brainstorming |

## Adding Content

- **New MCP server**: Add to `servers` array in `mcp-servers.json`
- **New skill**: Create `skills/{name}/SKILL.md` with YAML frontmatter
- **Settings**: Edit `config.portable.json` for model, theme, etc.
