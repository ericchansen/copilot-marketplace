---
name: file-organizer
description: 'Organize and clean up local directories. Use when user says "organize my files", "clean up OneDrive", "audit my files", "fix duplicates", "where should this file go", "what folders are duplicated", "tidy up my files", "my folder is a mess", "scan for misplaced files", or any request to review or reorganize a local directory.'
license: MIT
allowed-tools: PowerShell
---

# Local File Organizer

Audit, propose, and execute file organization — detects duplicates, misplaced files,
ad-hoc folders, and auto-dropped junk — then moves files to canonical locations with
full user approval before any changes.

## OneDrive Structure

Root: `C:\Users\erichansen\OneDrive - Microsoft\`

### Canonical Folder Taxonomy

```
OneDrive - Microsoft/
├── Accounts/                        # Customer-facing work, one subfolder per account
│   ├── Candescent/
│   ├── Citrix/
│   ├── CSG/
│   ├── IBM/
│   ├── NCR Atleos/
│   └── NCR Voyix/
├── Internal/                        # All internal Microsoft work
│   ├── Connect 2026/                # Performance review artifacts
│   ├── Monthly Opportunity Reports/ # All monthly reports (consolidated)
│   ├── Onboarding/                  # RCD-STU docs, new hire materials
│   ├── Presentations/               # Internal talks & training sessions
│   ├── Sales Enablement/            # Seismic dumps, pitch decks, battlecards, FAQs
│   │   └── LLM/                    # Foundry, Anthropic, quota FAQs & decks
│   ├── Skills Matrix/
│   ├── Weekly Summaries/            # Weekly impact decks & reports
│   └── Clippy Sales/               # SDK Challenge materials
├── Technical/                       # Technical docs organized by technology
│   ├── GitHub Copilot/              # Copilot CLI, skills, plugins, setup docs
│   │   └── Clawpilot/
│   ├── MSX MCP/                     # MSX MCP docs, HoK debug, behavior tests
│   ├── Azure/                       # SRE Agent, infra scripts, workshops
│   │   └── Azure SRE Agent/
│   └── AI/                          # Quota, model capacity, Agentic Odyssey
│       └── Quota/
├── Personal/                        # Resume, benefits, recovery codes, personal photos
├── Agency Cowork/                   # Agency Cowork app output (canonical)
├── Copilot Config Backup/           # SSH keys, sensitive-terms, session snapshots
├── ObsidianVaults/                  # Obsidian knowledge base (AccountGraph)
│
│ ── Protected (OS / auto-managed — do not reorganize) ──
├── Desktop/
├── Documents/                       # OS-synced — clean out sub-dumps but leave folder
├── Pictures/
├── Apps/
├── Whiteboards/
└── Recordings/                      # Teams auto-synced — NEVER touch
```

### Core Routing Rule

**Is it about a specific customer? --> `Accounts/<name>/`. Otherwise --> `Internal/<category>/`.**

Presentations and reports are NOT top-level folders. They belong under the account
or internal program they relate to:
- Account-specific deck --> `Accounts/NCR Atleos/`
- Internal training talk --> `Internal/Presentations/`
- Monthly opportunity report --> `Internal/Monthly Opportunity Reports/`
- Customer ACR review --> `Accounts/<name>/`
- HoK dashboard --> `Accounts/` (if for a customer) or `Internal/` (if team-level)

### Technical/ Routing

Technical content routes by technology area, not by file type:
- GitHub Copilot skills, plugins, CLI setup --> `Technical/GitHub Copilot/`
- Clawpilot docs --> `Technical/GitHub Copilot/Clawpilot/`
- MSX MCP anything (behavior tests, HoK debug, docs) --> `Technical/MSX MCP/`
- Azure SRE Agent, infra scripts, VM setup --> `Technical/Azure/`
- Workshop prerequisites (e.g., Agentic Odyssey) --> `Technical/AI/`
- Quota docs, model capacity --> `Technical/AI/Quota/`

### Auto-Dump Folders (distribute contents, then delete folder)

These folders collect junk from various apps. Route each file to its canonical
location based on content, then remove the empty folder:

| Folder | Source | Action |
|---|---|---|
| `Microsoft Teams Chat Files/` | Teams file sharing | Route each file by content |
| `Attachments/` | Email attachment downloads | Route each file by content |
| `AgentUploads/` | Agent output dumps | Route to `Agency Cowork/` or by content |
| `Microsoft Copilot Chat Files/` | M365 Copilot output | Route by content |
| `OneNote Loop Files/` | OneNote auto-created | Usually empty, delete if so |

### Known Duplicate Files

These files exist in multiple locations. Keep the canonical copy, delete duplicates:

| File | Canonical Location | Known Duplicates In |
|---|---|---|
| `HoK_Direct_Reports_Dashboard.xlsx` | `Internal/` or `Accounts/` | Documents/, Teams Chat Files/ |
| `HoK_Arthur_Ching_Dashboard.xlsx` | `Accounts/` | Documents/, Teams Chat Files/ |
| `NCR_Voyix_ACR_Review_v1.xlsx` | `Accounts/NCR Voyix/` | root, Teams Chat Files/ |
| `Connect_Growth_Final.md` | `Internal/Connect 2026/` | Teams Chat Files/ |
| copilot session HTML files | delete (ephemeral) | root, Attachments/, Teams Chat Files/ |
| personal photos (PXL_*) | `Pictures/Personal/` | Teams Chat Files/ |
| RCD-STU onboarding docs | `Internal/Onboarding/` | Teams Chat Files/ |

### Folders to Dissolve

These top-level folders should not exist. Distribute their contents:

| Folder | Route Contents To |
|---|---|
| `Presentations/` | `Internal/Presentations/` (not account-specific) |
| `Reports/` | `Internal/Monthly Opportunity Reports/` |
| `Seismic/` | `Internal/Sales Enablement/` (+ LLM/ subfolder) |
| `Scripts/` | `Technical/Azure/` |
| `Meetings/` | `Internal/` |
| `Clippy Sales - SDK Challenge/` | `Internal/Clippy Sales/` |

### Documents/ Cleanup

`Documents/` is an OS-synced folder — don't delete it, but clean out these sub-dumps:

| Subfolder/File | Route To |
|---|---|
| `Documents/Clawpilot/` | `Technical/GitHub Copilot/Clawpilot/` |
| `Documents/Copilot Config Backup/` | Already exists at top-level, merge there |
| `Documents/Cowork/` | `Agency Cowork/` |
| `Documents/Copilot/` | Delete if empty/orphaned |
| `Documents/Resume/` | `Personal/` |
| `Documents/HoK*.xlsx` | `Accounts/` or `Internal/` by content |
| `Documents/[EXTERNAL] FW_*.msg` | `Technical/AI/Quota/` |
| `Documents/*.excalidraw` | Route by content or delete |

### Root-Level Orphan Files

Files sitting at the OneDrive root that need a home:

| File | Route To |
|---|---|
| `copilot-session-*.html` | Delete (ephemeral session artifacts) |
| `DataZone-Standard-EU-GPT5-Models.csv` | `Technical/AI/` |
| `ECIF_*.xlsx` | `Accounts/` (ECIF = customer funding) |
| `Eric @ Microsoft.url` | `Personal/` |
| `L300 Agentic Odyssey*.pdf` | `Technical/AI/` |
| `NCR_Voyix_ACR_Review*.xlsx` | `Accounts/NCR Voyix/` |

## Workflow

### AUDIT -- Scan and report

```powershell
$od = "C:\Users\erichansen\OneDrive - Microsoft"
# Find duplicate top-level folders
Get-ChildItem -LiteralPath $od -Directory |
  Group-Object { $_.Name.ToLower().Trim() } |
  Where-Object Count -gt 1

# Find files in multiple locations
Get-ChildItem -LiteralPath $od -Recurse -File -Depth 2 |
  Group-Object Name | Where-Object Count -gt 1
```

1. Scan top-level folders and file counts
2. Identify: duplicates, auto-dump folders, files in wrong location, orphan root files
3. Present report: `Issue | Count | Example | Recommended Action`
4. Ask which categories to act on

### PROPOSE -- Generate move plan

1. Build move plan table: `# | Source | Destination | Reason | Files affected`
2. Show examples (first 2-3 files per move, totals)
3. Present to user -- **NEVER move anything without explicit approval**
4. User approves all, approves by number, or skips

### EXECUTE -- Apply approved moves

```powershell
# ALWAYS use -LiteralPath (brackets in filenames break -Path)
Move-Item -LiteralPath "<source>" -Destination "<dest>" -Force
```

After each move, append to move log:
```json
{"ts":"2026-05-13T09:30:00","source":"...","dest":"...","reason":"..."}
```

Move log location: `~/.copilot/skills/file-organizer/move-log.jsonl`

### ROUTE -- "Where does this file go?"

1. Is it about a specific customer? --> `Accounts/<name>/`
2. Is it a presentation, report, or internal doc? --> `Internal/<category>/`
3. Is it technical content? --> `Technical/<technology>/`
4. Is it personal? --> `Personal/`
5. Unsure? --> Ask the user

### DEDUPLICATE -- Merge duplicate folders or files

1. List contents of all copies side-by-side
2. Compare by size and date -- keep newest or largest
3. Show merge plan, flag true conflicts
4. Execute only after approval
5. Remove empty secondary folders

## Safety Rules

1. **Never move or delete without explicit user approval.** Always show the full plan first.
2. **Always use `-LiteralPath`** in all PowerShell file operations.
3. **Never touch `Recordings/`** -- auto-synced by Teams, moving breaks the link.
4. **Minimize changes to `Desktop/`, `Documents/`, `Pictures/`** -- OS-synced folders.
5. **Log every move** to `~/.copilot/skills/file-organizer/move-log.jsonl`.
6. **Check for collisions** before every move -- pause and ask if destination already has that name.
7. **Validate file counts** before and after folder merges.
8. **When in doubt about where a file goes, ask** -- don't guess.
