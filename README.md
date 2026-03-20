# Copilot Config

Personal [GitHub Copilot CLI](https://docs.github.com/copilot/concepts/agents/about-copilot-cli) configuration, custom skills, and setup automation — synced across machines via Git.

## What's Included

| File | Purpose |
|------|---------|
| `.copilot/copilot-instructions.md` | Global custom instructions for all sessions |
| `.copilot/lsp-config.json` | Language server configuration (TypeScript, Python, Rust) |
| `.copilot/config.portable.json` | Portable settings (model, theme, banner — no auth) |
| `.copilot/skills/` | Custom skills (see below) |
| `mcp-servers.json` | MCP server definitions (generates `~/.copilot/mcp-config.json`) |

## Quick Start

1. **Clone this repository:**
   ```bash
   git clone git@github.com:ericchansen/copilot-config.git ~/repos/copilot-config
   cd ~/repos/copilot-config
   ```

2. **Run the setup script:**

   **PowerShell (Windows):**
   ```powershell
   ./setup.ps1                                           # Interactive — prompts for options
   ./setup.ps1 -Work                                     # Include work tools (MSX-MCP, Power BI)
   ./setup.ps1 -NonInteractive                           # No prompts, base only (safe for cron)
   ./setup.ps1 -NonInteractive -Work                     # No prompts, everything enabled
   ```

   **Bash (macOS/Linux):**
   ```bash
   ./setup.sh                                            # Interactive — prompts for options
   ./setup.sh --work                                     # Include work tools (MSX-MCP, Power BI)
   ./setup.sh --non-interactive                          # No prompts, base only (safe for cron)
   ./setup.sh --non-interactive --work                   # No prompts, everything enabled
   ```

   > **Note:** The Bash scripts require `jq` for JSON processing and Bash 4+. On macOS, install both with `brew install bash jq`.

The setup script will:
- **Check git authentication** — detects SSH keys and GitHub CLI accounts, uses `gh auth token` for clone fallbacks (no browser popups)
- Back up your existing `~/.copilot/` config
- Symlink instructions and skills into `~/.copilot/`
- Patch your `config.json` with portable settings (without touching auth)
- **Clean up legacy skill junctions** — removes old anthropic/awesome-copilot/msx-mcp/SPT-IQ junctions from previous setups
- Build local MCP servers (clone, install deps, compile)
- Validate required environment variables (prompt if missing)
- Generate `~/.copilot/mcp-config.json` with correct OS paths
- Clean up stale junctions for excluded or removed skills

Run the setup script again at any time to pull updates and re-sync.

## Git Authentication

The setup script clones and pulls multiple GitHub repos. To avoid credential popups, the script runs a **preflight auth check** before any git operations:

1. **SSH (preferred)** — checks `ssh -T git@github.com`. If SSH keys are configured, all clone/pull operations use `git@github.com:owner/repo.git` URLs. Existing HTTPS remotes are automatically upgraded to SSH.
2. **GitHub CLI** — detects `gh auth status` and reports which accounts are available. If SSH isn't available, `gh repo clone` is used as a fallback (uses cached auth tokens).
3. **Git Credential Manager** — if neither SSH nor `gh` is available, standard `git clone` runs and may trigger interactive credential prompts.

### Recommended Setup

```bash
# 1. Install GitHub CLI (if not already)
# https://cli.github.com

# 2. Authenticate
gh auth login

# 3. Configure SSH as the git protocol (eliminates credential popups)
gh auth setup-git
```

For multi-account setups (personal + work), configure SSH keys per account in `~/.ssh/config`:

```
# Personal
Host github.com
  HostName github.com
  IdentityFile ~/.ssh/id_ed25519_personal

# Work (if needed via separate host alias)
Host github-work
  HostName github.com
  IdentityFile ~/.ssh/id_ed25519_work
```

## Environment Variables

Some MCP servers require API keys or secrets. These are referenced in `mcp-config.json` using `${VAR_NAME}` syntax so that secrets are never committed to git.

### Required Variables

| Variable | Purpose | How to Get |
|----------|---------|-----------|
| `CONTEXT7_API_KEY` | Context7 documentation lookup | [context7.com](https://context7.com) — free tier available |

### Setting Variables (Windows)

```powershell
# Set permanently for your user account (persists across reboots)
[System.Environment]::SetEnvironmentVariable("CONTEXT7_API_KEY", "your-key-here", "User")

# Restart your terminal for the change to take effect
```

### Setting Variables (macOS/Linux)

```bash
# Add to your shell profile (~/.bashrc, ~/.zshrc, etc.)
export CONTEXT7_API_KEY="your-key-here"

# Reload your shell
source ~/.bashrc  # or ~/.zshrc
```

> **Note:** Never put actual API keys in `mcp-servers.json` — always use `${VAR_NAME}` references. The Copilot CLI resolves these from your environment at startup.

## MCP Servers

MCP server configuration is defined in `mcp-servers.json` and generated into `~/.copilot/mcp-config.json` at setup time. This ensures correct OS paths and only enabled servers are included.

### Base Servers (always enabled)

| Server | Type | Purpose |
|--------|------|---------|
| azure-mcp | npx | Azure resource management |
| context7 | http | Documentation search (needs `CONTEXT7_API_KEY`) |
| microsoft-learn | http | Microsoft Learn docs |
| playwright | npx | Browser automation (Edge) |
| chrome-devtools | npx | Chrome DevTools debugging |

### Optional Servers

| Server | Flag | Type | Purpose |
|--------|------|------|---------|
| powerbi-remote | `-Work` | http | Power BI Fabric API |

## LSP Servers

Language server configuration is defined in `.copilot/lsp-config.json` and symlinked to `~/.copilot/lsp-config.json` during setup.

| Server | Binary | Install Command |
|--------|--------|----------------|
| TypeScript | `typescript-language-server` | `npm install -g typescript-language-server typescript` |
| Python | `pyright-langserver` | `npm install -g pyright` |
| Rust | `rust-analyzer` | `rustup component add rust-analyzer` |

The setup script offers to install these as optional dependencies. They provide code intelligence (go-to-definition, references, hover, rename) when working in repos with these languages.

## Updating

```bash
cd ~/repos/copilot-config
git pull
./setup.ps1   # Windows (PowerShell)
./setup.sh    # macOS/Linux (Bash)
```

## Backing Up

Some personalization files live in `~/.copilot/` but aren't tracked by this repo (they contain PII, secrets blocklists, or machine-specific data). The backup script copies them to your OneDrive sync folder so they survive machine wipes.

**What gets backed up:**

| File | Purpose |
|------|---------|
| `sensitive-terms.txt` | PII/secrets blocklist for safety scans |
| `email-signature.html` | Outlook email signature |
| `email-style.md` | Email drafting style guide |
| `permissions-config.json` | Tool permission grants |
| `powerbi-mcp-proxy.mjs` | Power BI MCP stdio↔HTTP proxy |
| `session-store.db` | All past Copilot CLI session history (timestamped snapshots, last 10 kept) |

**Run a backup:**

```powershell
./backup.ps1                     # Full backup (config + session store)
./backup.ps1 -SkipSessionStore   # Config files only (faster)
```

```bash
./backup.sh                      # Full backup (config + session store)
./backup.sh --skip-session       # Config files only (faster)
```

**Where backups go:** `<OneDrive sync root>/Documents/Copilot Config Backup/`
- **Windows:** `C:\Users\<you>\OneDrive - Microsoft\Documents\Copilot Config Backup\`
- **macOS:** `~/Library/CloudStorage/OneDrive-Microsoft/Documents/Copilot Config Backup/`
- Override with `ONEDRIVE_BACKUP_DIR` env var if your sync folder has a different name
- Config files are overwritten in place (latest version only)
- Session store snapshots are date-stamped in `session-snapshots/` with a `session-store-latest.db` for quick restore
- OneDrive sync client handles cloud upload automatically

> **Tip:** Run `./backup.ps1` periodically (weekly, or before major changes). Session history is the only thing that can't be recreated.

## Restoring

If something breaks, use the restore script to remove all symlinks and optionally restore from backup:

```powershell
./restore.ps1   # Windows (PowerShell)
./restore.sh    # macOS/Linux (Bash)
```

### Restoring from a machine wipe

After a fresh OS install:

1. Sign into OneDrive for Business and wait for sync to complete
2. Clone this repo and run setup:

   **Windows (PowerShell):**
   ```powershell
   git clone git@github.com:ericchansen/copilot-config.git ~/repos/copilot-config
   cd ~/repos/copilot-config
   ./setup.ps1 -Work
   ```

   **macOS/Linux (Bash):**
   ```bash
   git clone git@github.com:ericchansen/copilot-config.git ~/repos/copilot-config
   cd ~/repos/copilot-config
   ./setup.sh --work
   ```
3. Copy personalization files back from OneDrive:
   ```powershell
   $backup = "$env:USERPROFILE\OneDrive - Microsoft\Documents\Copilot Config Backup"
   $copilot = "$env:USERPROFILE\.copilot"
   Copy-Item "$backup\sensitive-terms.txt" $copilot
   Copy-Item "$backup\email-signature.html" $copilot
   Copy-Item "$backup\email-style.md" $copilot
   Copy-Item "$backup\permissions-config.json" $copilot
   Copy-Item "$backup\powerbi-mcp-proxy.mjs" $copilot
   ```
4. Restore session history (optional):
   ```powershell
   Copy-Item "$backup\session-snapshots\session-store-latest.db" "$copilot\session-store.db"
   ```
5. Re-install plugins:
   ```bash
   copilot plugin install mcaps-microsoft/MSX-MCP
   # Plus any other plugins from `copilot plugin list`
   ```
6. Re-authenticate MCP servers (Teams, Outlook, SharePoint will prompt on first use)
7. Set environment variables (see [Environment Variables](#environment-variables))

## Custom Skills

### git-commit
Conventional commit messages with [Chris Beams' 7 rules](https://cbea.ms/git-commit/). Auto-detects type and scope from your diff, scans for secrets, checks repo contribution guidelines, and generates properly formatted commit messages.

**Trigger:** Ask to commit, create a git commit, push code, create a PR, or say "/commit"

### git-safety-scan
Mandatory pre-push scan for secrets, PII, customer names, and sensitive data. Supports a user blocklist at `~/.copilot/sensitive-terms.txt`.

**Trigger:** Automatically invoked before any `git push` or PR creation

### summon-the-knights-of-the-round-table
Multi-model brainstorming using Claude Opus 4.6, GPT-5.3-Codex, and Gemini 3 Pro with randomized Devil's Advocate / Explorer / Steelman roles for structured debate.

**Trigger:** "summon knights of the round table to review..."

## Plugins (installed separately)

Community skills are installed via Copilot CLI's plugin system, not managed by this repo's setup scripts.

### awesome-copilot (pre-registered marketplace)

The `awesome-copilot` marketplace is built into Copilot CLI — no setup needed. Browse and install themed skill bundles:

```bash
copilot plugin install project-planning@awesome-copilot
copilot plugin install testing-automation@awesome-copilot
copilot plugin install csharp-dotnet-development@awesome-copilot
# See all: copilot plugin search @awesome-copilot
```

### anthropic-agent-skills

Add the Anthropic marketplace, then install plugins:

```bash
copilot plugin marketplace add anthropics/skills
copilot plugin install document-skills@anthropic-agent-skills    # xlsx, docx, pptx, pdf
copilot plugin install example-skills@anthropic-agent-skills     # frontend-design, web-artifacts, etc.
```

### MSX-MCP

```bash
copilot plugin install mcaps-microsoft/MSX-MCP
```

### Managing plugins

```bash
copilot plugin list         # Show installed plugins
copilot plugin update       # Update all plugins
copilot plugin remove <name> # Uninstall a plugin
```

## About Agent Skills

Agent Skills are an [open standard](https://github.com/agentskills/agentskills) maintained by Anthropic for giving agents new capabilities. Skills are folders containing a `SKILL.md` with YAML frontmatter and optional bundled resources (scripts, references, assets).

## Optional Dependencies

The setup scripts offer to install these optional tools during setup. They enhance specific skills but aren't required — the agent works without them.

| Tool | Install Command | Purpose |
|------|----------------|---------|
| [MarkItDown](https://github.com/microsoft/markitdown) | `pip install 'markitdown[all]'` | Converts PDF/Word/Excel/HTML to markdown |
| [QMD](https://github.com/tobi/qmd) | `npm install -g @tobilu/qmd` | Local hybrid search for semantic memory (Node.js 22+) |
| Playwright Edge | `npx playwright install msedge` | Edge browser driver for browser automation |

To install later, run the commands above manually or re-run the setup script.

## License

MIT
