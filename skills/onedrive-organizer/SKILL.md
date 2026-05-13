---
name: onedrive-organizer
description: 'Organize, audit, and clean up OneDrive. Use when user says "organize my OneDrive", "clean up OneDrive", "audit my files", "fix duplicates", "where should this file go", "what folders are duplicated", "tidy up my files", "OneDrive is a mess", "scan for misplaced files", or any request to review or reorganize OneDrive at C:\Users\erichansen\OneDrive - Microsoft.'
license: MIT
allowed-tools: PowerShell
---

# OneDrive Organizer

Audit, propose, and execute OneDrive organization — detects duplicates, misplaced files,
ad-hoc folders, and auto-dropped junk — then moves files to canonical locations with
full user approval before any changes.

## OneDrive Root

`C:\Users\erichansen\OneDrive - Microsoft\`

## Canonical Folder Structure

```
OneDrive - Microsoft/
├── Accounts/              # Customer-facing work by account name (IBM, NCR Voyix, etc.)
├── Internal/              # Internal Microsoft work
│   └── Connect 2026/      # FY26 performance review artifacts
├── Technical/             # Skills, MCP configs, code, technical docs
│   ├── Clawpilot/
│   ├── MSX MCP/
│   └── Quota/
├── Presentations/         # Slide decks (.pptx, reveal.js)
├── Reports/               # Generated reports (HoK dashboards, etc.)
├── Recordings/            # Auto-synced by Teams — DO NOT TOUCH
├── Personal/              # Personal files
├── Agency Cowork/         # Agency Cowork app canonical output folder
├── Copilot Talk/          # GitHub Copilot training materials
├── Archive/               # Old / date-stamped one-offs
├── Desktop/               # OS-synced — leave in place
├── Documents/             # OS-synced — minimize manual adds
├── Pictures/
└── Screenshots/           # Auto-synced — leave in place
```

## Known Problem Patterns

| Pattern | Example | Fix |
|---|---|---|
| Duplicate folders | `agency-cowork` + `Agency Cowork` | Merge → `Agency Cowork/` |
| Date-stamped one-offs | `2026-03-12 Copilot CLI Setup` | Move → `Archive/` |
| Teams auto-dropped files | `Microsoft Teams Chat Files/*.xlsx` | Route by content type |
| Attachment dumps | `Attachments/*.eml` | Route or delete |
| Reports in Documents | `Documents/HoK_Arthur_Ching_Dashboard.xlsx` | Move → `Reports/` |
| Duplicate report folders | `Monthly Opportunity Reports` ×2 | Merge, keep one |
| Agent output scatter | `AgentUploads/`, `Cowork/` | Consolidate → `Agency Cowork/` |
| Duplicate Personal/Screenshots | Same name, two instances | Merge |

## Workflow

### AUDIT — Scan and report

```powershell
$od = "C:\Users\erichansen\OneDrive - Microsoft"
# Find duplicate top-level folders (same name, different case)
Get-ChildItem -LiteralPath $od -Directory |
  Group-Object { $_.Name.ToLower().Trim() } |
  Where-Object Count -gt 1 |
  Select-Object Name, Count, @{n='Paths';e={$_.Group.FullName -join ' | '}}
```

1. Scan top-level folders and file counts
2. Identify: duplicates, date-stamped, known auto-dump folders, files in wrong location
3. Present report: `Issue | Count | Example | Recommended Action`
4. Ask which categories to act on

### PROPOSE — Generate move plan

1. Build move plan as a table: `# | Source | Destination | Reason | Files affected`
2. Present to user — **NEVER move anything without explicit approval**
3. User approves → execute

### EXECUTE — Apply approved moves

Always use `-LiteralPath` (never `-Path`) — brackets in filenames are glob wildcards and will silently fail:

```powershell
# CORRECT
Move-Item -LiteralPath "<source>" -Destination "<dest>" -Force

# WRONG — breaks on filenames with [ ] brackets
Move-Item -Path "<source>" ...
```

Log every completed move to `C:\Users\erichansen\.copilot\skills\onedrive-organizer\move-log.jsonl`:
```json
{"ts":"2026-05-13T09:30:00","source":"...old path...","dest":"...new path...","reason":"Reports/ canonical"}
```

### ROUTE — "Where does this file go?"

| File pattern | Destination |
|---|---|
| `*.pptx` / `*presentation*.html` | `Presentations/` or `Accounts/<name>/` if account-specific |
| `HoK*.xlsx` / `*Dashboard*.xlsx` | `Reports/` |
| `*Recording*` / `*.mp4` | `Recordings/` — leave alone |
| `*Connect*` / `*FY26*` | `Internal/Connect 2026/` |
| `*quota*` / `*capacity*` | `Technical/Quota/` or `Accounts/<name>/` |
| `SKILL.md` / `AGENTS.md` | `Technical/` |
| `*.eml` / `*.msg` | `Archive/` or delete |

### DEDUPLICATE — Merge duplicate folders

1. List contents of both folders side-by-side
2. Identify unique-to-A, unique-to-B, and true conflicts (same name, different content)
3. Show merge plan — keep canonical casing
4. Execute after approval, then remove empty secondary folder

## Safety Rules

1. **Never move or delete without explicit user approval.** Always show the full plan first.
2. **Always use `-LiteralPath`** in all PowerShell file operations.
3. **Never touch `Recordings/`** — auto-synced by Teams.
4. **Never touch `Desktop/` or `Documents/`** unless user explicitly asks.
5. **Log every move** to `move-log.jsonl`.
6. **Check for collisions** before every move — pause and ask if the destination already has that filename.
7. **Validate file counts** before and after folder merges.
