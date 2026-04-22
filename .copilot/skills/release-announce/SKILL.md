---
name: release-announce
description: 'Draft and post a release announcement to a Teams channel. Reads CHANGELOG.md and/or GitHub release notes, drafts a concise channel post, shows a preview for approval, then sends via Graph API with a proper subject line. Use when user says "announce release", "post release to Teams", "release announcement", "share release notes", or any variant of publishing a release update to a Teams channel.'
license: MIT
---

# Release Announcement Skill

Draft and post a release announcement to a Microsoft Teams channel. Reads release notes from the current repository, composes a concise channel-friendly message, previews it for approval, and posts it with a proper subject line.

## Inputs

The user must specify or confirm:

| Input | Required | How to resolve |
|-------|----------|----------------|
| **Version** | Yes | Read from `package.json`, `Cargo.toml`, `pyproject.toml`, or ask the user |
| **Release notes source** | Yes | `CHANGELOG.md` in the repo, or `gh release view <tag>` from GitHub |
| **Teams channel** | Yes | User specifies by name (e.g., "MSX MCP General"). Resolve via the `teams` skill cache or MCP tools |
| **Repo** | Usually CWD | Confirm with the user if ambiguous |

## Workflow

### Step 1: Gather release info

1. **Detect the version** — read `package.json` (or equivalent) in the current working directory
2. **Read the changelog** — parse `CHANGELOG.md` for the matching `## [version]` section. Extract:
   - Added features
   - Changed items
   - Fixed items
   - Dependency bumps (summarize count, don't list each one)
3. **Fallback to GitHub** — if no CHANGELOG.md, try `gh release view v<version> --json body`

### Step 2: Compose the announcement

Write a concise markdown draft following these rules:

**Content rules:**
- Lead with the version number and a link to the GitHub release page
- Highlight new features prominently (1–2 sentences each)
- Summarize improvements and fixes briefly (bullet points)
- Mention dependency bump count (e.g., "5 dependency bumps") — don't list them individually
- **Never include test counts, CI stats, or internal metrics** — no one outside the team cares
- **Never include tool/skill counts** unless the audience is developers using the tools
- Keep it short enough to avoid Teams "see more" truncation (~300 words max)
- Use emoji shortcodes sparingly for visual anchors (`:rocket:`, `:check:`, `:bulb:`)

**Format rules:**
- **No H1 headers in body** — the subject field handles the title
- Use bold (`**text**`) for section labels
- Use bullet lists for multiple items
- Use `--` (double dash) instead of em-dashes (Teams rendering)
- End with the release link, not a call-to-action

**Subject line format:** `<Project Name> v<version> Released`

### Step 3: Preview and confirm

**MANDATORY: Show a final preview before sending.** Display:

```
Subject: <Project Name> v<version> Released
Channel: <Team Name> > <Channel Name>
Body:
<full markdown body>
```

Then ask: **"Ready to send?"**

Do NOT send until the user explicitly confirms (e.g., "send it", "yes", "go").

### Step 4: Resolve the channel

Use the Teams MCP tools to resolve the channel:

1. List teams: use the Teams MCP `ListTeams` tool to find the target team by name
2. List channels: use `ListChannels` for that team to find the target channel
3. Note the `teamId` and `channelId` for posting

### Step 5: Send

1. Write the markdown body to a temp file
2. Scan the body for credentials (API keys, tokens) — block if found
3. Convert markdown to HTML and build the Graph API payload (with `subject` field)
4. Ensure `az CLI` is authenticated as the correct corporate identity (check `az account show`)
5. POST via Graph API: `POST /teams/{teamId}/channels/{channelId}/messages` with `subject` and `body.contentType: html`
6. Clean up temp files
7. Report: message ID and confirmation

**Auth note:** If Graph API returns 403 "AclCheckFailed", switch to the corporate account:
```powershell
az account set --subscription "<corporate subscription name>"
```
Then retry. Restore the previous subscription afterward.

### Step 6: No "Agency Cowork:" prefix

Release announcements are user-authored content. Do NOT prepend "Agency Cowork:" — that prefix is for agent-initiated messages only.

## Example Output

```
Subject: MSX MCP v0.6.0 Released
Channel: MSX MCP > General

Body:
:rocket: **v0.6.0 is live** -- [Release Notes](https://github.com/mcaps-microsoft/MSX-MCP/releases/tag/v0.6.0)

**New: Milestone Coach skill** -- Proactive milestone hygiene coaching
that cross-references milestones with HoK activities and classifies
them into action buckets with a prioritized action list.

**ACR improvements:**
- Synapse-to-Fabric migration bridging
- Annotation attribution rules (must cite MSX pipeline)
- Clean month header mapping with deterministic sort

**Also:** 5 dependency bumps, CI firewall fixes.
```

## Error Handling

| Error | Resolution |
|-------|------------|
| No CHANGELOG.md | Fall back to `gh release view` |
| No GitHub release | Ask user to provide release notes or paste them |
| Channel not found | Ask user for exact team and channel name |
| 403 AclCheckFailed | Switch `az account` to corporate identity, retry |
| Validation fails | Fix broken emoji shortcodes or URLs, re-validate |
| Credential detected | Block send, alert user with findings |

## Composes With

- **git-commit** — often invoked right before this skill (commit → tag → release → announce)
