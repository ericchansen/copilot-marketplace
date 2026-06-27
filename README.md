# copilot-marketplace

Personal GitHub Copilot CLI marketplace containing 10 independently installable skill plugins.

## Install

Open Copilot CLI, then register this marketplace once:

```text
copilot
/plugin marketplace add ericchansen/copilot-marketplace
```

Install plugins individually:

```text
/plugin install doc-generator@copilot-marketplace
```

Replace `doc-generator` with any plugin name below.

## Plugins

- `api-reverse-engineer` — Capture browser network requests through Chrome DevTools Protocol when a web UI is the only reliable API reference.
- `azure-doctor` — Diagnose and fix Azure deployments across repos, CI/CD pipelines, subscriptions, and service health.
- `clean` — Perform post-merge git cleanup by returning to main/master, pulling latest, deleting merged branches, pruning remotes, and verifying a clean state.
- `doc-generator` — Generate professional PDF and Word (DOCX) documents from markdown source files.
- `edge-browser` — Launch Microsoft Edge with a specific user profile and remote debugging enabled for CDP control.
- `git-code-review` — Run a structured closeout review over local, branch, commit, or PR diffs before shipping.
- `git-commit` — Create conventional commits with diff analysis, safe staging, and repository guideline awareness.
- `git-safety-scan` — Scan staged changes or commits for sensitive data before pushing to remote.
- `github-writer` — Write PRs, issues, and comments for GitHub with encoding-safe body files and sanitized, structured content.
- `pr-review-address` — Review, address, and resolve GitHub PR feedback across comments, review threads, and requested changes.

## Repository structure

```text
plugins/<name>/
  plugin.json
  skills/<name>/SKILL.md
```

Skill helper files live beside their `SKILL.md` files. `copilot-home/` holds the portable user-level config (settings, MCP/LSP servers, instructions) deployed to `~/.copilot/` via `copilot-home/link.ps1` — see `copilot-home/README.md`.
