# copilot-config

A Copilot CLI plugin with personal skills, MCP servers, and LSP servers for git workflow,
document generation, API reverse-engineering, PR review, and developer productivity.

## Install

```bash
# 1. Register the marketplace (one-time)
copilot plugin marketplace add ericchansen/copilot-config

# 2. Install the plugin
copilot plugin install copilot-config@copilot-config
```

Verify:

```bash
copilot plugin list
```

Update later:

```bash
copilot plugin update copilot-config@copilot-config
```

## Skills

| Skill | Triggers | Purpose |
|-------|----------|---------|
| **git-commit** | `/commit`, "commit changes", "push code" | Conventional commit messages with intelligent staging |
| **git-safety-scan** | Automatic before push | Scans for secrets, PII, and custom blocklist terms |
| **clean** | "clean up", "merged, clean up", "back to main" | Post-merge branch cleanup and next-steps |
| **gh-writer** | `gh pr create`, `gh issue create`, `gh issue comment` | Encoding-safe + content quality for all GitHub writes |
| **pr-review-address** | "address PR comments", "fix review" | Categorize, fix, reply to, and resolve PR feedback |
| **code-review** | "review my code", "closeout review", "review this branch/PR" | Structured closeout review with verify-before-fix and rerun-until-clean |
| **doc-generator** | "generate PDF", "create Word doc" | Markdown → PDF/DOCX via Playwright + python-docx |
| **api-reverse-engineer** | "reverse engineer", "sniff the API" | Intercept browser network traffic via CDP |
| **edge-browser** | Profile-specific browsing needs | Launch Edge with debug port for authenticated sessions |
| **revealjs-presentation** | "create a presentation", "make slides", "build a deck" | Generate Reveal.js HTML slide decks from topic outlines |
| **release-announce** | "announce release", "post to Teams" | Draft and send release announcements to Teams channels |

## MCP Servers

| Server | Type | Purpose |
|--------|------|---------|
| azure-mcp | stdio | Azure resource management via `@azure/mcp` |
| context7 | remote | Library documentation lookup via Context7 |
| msft-learn | remote | Microsoft Learn documentation search |
| playwright | stdio | Browser automation via Playwright MCP |
| chrome-devtools | stdio | Chrome DevTools Protocol access |

## LSP Servers

| Server | Languages | Command |
|--------|-----------|---------|
| typescript | `.ts`, `.tsx`, `.js`, `.jsx` | `typescript-language-server --stdio` |
| python | `.py` | `pyright-langserver --stdio` |
| rust | `.rs` | `rust-analyzer` |

## Extras

The `extras/` directory contains files that the plugin system cannot deploy automatically:

| File | Purpose | Manual install |
|------|---------|----------------|
| `copilot-instructions.md` | Global behavioral instructions (git workflow, security, verification) | Copy to `~/.copilot/copilot-instructions.md` |
| `config.portable.json` | Personal settings (model, theme, reasoning effort) | Merge into `~/.copilot/config.json` |

## Adding Content

- **New skill**: Create `skills/{name}/SKILL.md` with YAML frontmatter
- **New MCP server**: Add to `mcpServers` in `.mcp.json`
- **New LSP server**: Add to `lspServers` in `lsp.json`
