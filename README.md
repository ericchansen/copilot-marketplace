# copilot-marketplace

Personal GitHub Copilot CLI marketplace containing 6 independently installable skill plugins.

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

- `azure-doctor` — Diagnose and fix Azure deployments across repos, CI/CD pipelines, subscriptions, and service health.
- `clean` — Perform post-merge git cleanup by returning to main/master, pulling latest, deleting merged branches, pruning remotes, and verifying a clean state.
- `doc-generator` — Generate professional PDF and Word (DOCX) documents from markdown source files.
- `edge-browser` — Launch Microsoft Edge with a specific user profile and remote debugging enabled for CDP control.
- `git-safety-scan` — Scan staged changes or commits for sensitive data before pushing to remote.
- `pr-review-address` — Review, address, and resolve GitHub PR feedback across comments, review threads, and requested changes.

## Repository structure

```text
plugins/<name>/
  plugin.json
  skills/<name>/SKILL.md
```

Skill helper files live beside their `SKILL.md` files. `copilot-home/` holds the portable user-level config (settings, MCP/LSP servers, instructions) deployed to `~/.copilot/` via `copilot-home/link.ps1` — see `copilot-home/README.md`.
