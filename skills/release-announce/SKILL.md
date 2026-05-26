---
name: release-announce
description: 'Draft and post a release announcement to a Teams channel. Reads CHANGELOG.md and/or GitHub release notes, identifies contributors, drafts a channel post with optional native @mentions, shows a preview for approval, then sends via Graph API with a proper subject line. Use when user says "announce release", "post release to Teams", "release announcement", "share release notes", or any variant of publishing a release update to a Teams channel.'
license: MIT
allowed-tools: Bash, PowerShell
---

# Release Announcement Skill

Draft and post a release announcement to a Microsoft Teams channel. Reads release notes from the current repository, identifies contributors who deserve credit, composes a channel-friendly message with optional native Teams @mentions, previews it for approval, and posts it with a proper subject line.

## Inputs

The user must specify or confirm:

| Input | Required | How to resolve |
|-------|----------|----------------|
| **Version** | Yes | Read from `package.json`, `Cargo.toml`, `pyproject.toml`, or ask the user |
| **Release notes source** | Yes | `CHANGELOG.md` in the repo, or `gh release view <tag>` from GitHub |
| **Teams channel** | Yes | User specifies by name (e.g., "Acme Project > General"). Resolve via Teams MCP tools |
| **Repo** | Usually CWD | Confirm with the user if ambiguous |
| **Notify contributors** | Optional | Default off. Offer y/n when contributors are detected |

## Workflow

### Step 1: Gather release info

1. **Detect the version** -- read `package.json` (or equivalent) in the current working directory.
2. **Read the changelog** -- parse `CHANGELOG.md` for the matching `## [version]` section. Extract:
   - Added features
   - Changed items
   - Fixed items
   - Dependency bumps (summarize count, do not list each one)
3. **Fallback to GitHub** -- if no CHANGELOG.md, try `gh release view v<version> --json body`.

### Step 2: Identify contributors

Building a deduplicated list of contributors enables proper credit and optional @mention notifications.

1. **Code contributors** -- people who landed commits in this release:
   ```bash
   git log v<previous>..v<current> --pretty="format:%h %an <%ae> | %s"
   ```
   Exclude bot accounts (`dependabot[bot]`, `github-actions[bot]`, `release-please[bot]`, etc.) and the release author (usually the user themselves).

2. **Issue reporters** -- scan the changelog body for `closes #N` / `fixes #N` / `resolves #N`:
   ```bash
   gh issue view <N> --json author
   ```

3. **PR / alternative-fix contributors** -- scan for `supersedes #N` references or PRs explicitly credited in commit messages:
   ```bash
   gh pr view <N> --json author
   ```

4. **Resolve display names + IDs (for real @mentions only)** -- if the user opts in to notifications in Step 5:
   - Construct the corporate UPN from the GitHub login (typical pattern is `<alias>@<corp-domain>`).
   - Call the Teams MCP `GetUserPresence` tool with the UPN. The response `id` field is the AAD object GUID.
   - Use the GitHub `author.name` field as the Teams display name (must match the AAD display name).
   - If `GetUserPresence` 404s, ask the user for the correct UPN.

Cache the result as `contributors[]` with `{ githubLogin, displayName, aadId, role }` where `role` is `code`, `reporter`, or `alternative-pr`.

### Step 3: Compose the announcement

**Content rules:**
- Lead with the version and a link to the GitHub release page.
- Highlight new features prominently (1-2 sentences each).
- Summarize improvements and fixes briefly.
- Mention dependency bump count (e.g., "5 dependency bumps") -- never list each bump.
- Add a "Thanks to" section when contributors were identified in Step 2.
- Never include test counts, CI stats, or internal metrics.
- Never include tool/skill counts unless the audience is developers using the tools.
- Keep it short enough to avoid Teams "see more" truncation (~300 words max).

**Visual hierarchy (Teams-specific, important):**
- Use `<h2>` for the announcement headline (one only).
- Use `<h3>` for section labels (`What broke`, `The fix`, `Thanks to`, `Upgrade`, etc.). Do NOT use bold for section labels -- it reads as a flat wall of text in Teams.
- Reserve `<strong>` for inline emphasis on specific phrases mid-sentence (e.g., "this fixes <strong>spawn EINVAL</strong>").
- Insert `<p>&nbsp;</p>` between sections for visible vertical spacing -- Teams collapses consecutive `<p>` margins otherwise.
- Use `<code>` for inline code, file paths, package names, command snippets.
- Use HTML entities for emoji (e.g., `&#x1F527;` for wrench) -- `:wrench:` style shortcodes do NOT auto-convert in Teams HTML.
- Use `--` (double dash) instead of em-dashes -- Teams renders the entity reliably.
- Wrap URLs in `<a href="...">link text</a>` rather than raw URLs.

**Subject line format:** `<Project Name> v<version> Released`

### Step 4: Resolve the channel

1. `ListTeams` -- find the target team by display name.
2. `ListChannels` -- find the target channel within that team.
3. Note the `teamId` and `channelId` for posting.

### Step 5: Preview and confirm

**MANDATORY: Show a final preview before sending.** Display the subject, channel, body (with mention placeholders if any), and a contributor breakdown.

Ask two questions in one prompt:
1. **"Ready to send?"** (yes/revise/cancel)
2. **"Notify contributors via native @mentions?"** (yes/no -- default no, since contributors are typically already notified via GitHub close comments).

Do NOT send until the user explicitly confirms.

### Step 6: Send

Prefer the Teams MCP `SendMessageToChannel` tool over raw Graph API calls. It accepts the `mentions` array directly and handles auth.

**Without mentions (default):**

```
SendMessageToChannel(
  teamId, channelId,
  subject = "<Project Name> v<version> Released",
  contentType = "html",
  content = "<h2>...</h2><p>...</p>..."
)
```

**With native @mentions (when user opted in):**

Use `<at id="N">Display Name</at>` markup in the body, paired with a `mentions` array entry per index:

```
mentions = [
  { id: 0, mentionText: "Jamie Lee",
    mentioned: { user: { id: "<aad-guid>", displayName: "Jamie Lee", userIdentityType: "aadUser" } } },
  { id: 1, mentionText: "Sam Chen",
    mentioned: { user: { id: "<aad-guid>", displayName: "Sam Chen", userIdentityType: "aadUser" } } }
]
```

Each `id` in the body must match an entry in the array. Teams replaces the markup with the blue mention pill and notifies the user.

**Editing an existing message:** there is no `UpdateChannelMessage` MCP tool today. Fall back to a direct Graph PATCH:

```
PATCH https://graph.microsoft.com/v1.0/teams/{teamId}/channels/{channelId}/messages/{messageId}
```

using a token from `az account get-access-token --resource https://graph.microsoft.com`. Important caveat: edits that ADD mentions do not fire notifications -- the recipients only see the mention if they revisit the post. Send a fresh reply if you need to actually ping someone.

**Final steps:**
1. Scan the body for credentials (API keys, tokens) before posting -- block if found.
2. Ensure `az` is authenticated to the correct corporate identity (`az account show`) if you fall back to Graph PATCH.
3. Clean up any temp files.
4. Report the message ID and a link to the post.

### Step 7: No "Agency Cowork:" prefix

Release announcements are user-authored content. Do NOT prepend "Agency Cowork:" -- that prefix is for agent-initiated messages only.

## Example Output

A hotfix release. Uses `<h2>` for the headline, `<h3>` for section labels, `<strong>` only for inline emphasis, `<p>&nbsp;</p>` between sections for visible spacing, and `<at id="N">...</at>` markup for native mentions.

```html
<h2>&#x1F527; v1.2.3 is live</h2>
<p><a href="https://github.com/acme/widget/releases/tag/v1.2.3">Release Notes</a></p>

<h3>Hotfix for Windows users on Node 22+</h3>
<p>If you saw <code>spawn EINVAL</code> calling the CLI from this package, this fixes it.</p>

<p>&nbsp;</p>

<h3>What broke</h3>
<p>Since a recent Node.js mitigation, the runtime rejects <code>.cmd</code> files in <code>execFile</code>/<code>spawn</code> unless <code>shell: true</code> is passed -- but <code>shell: true</code> <strong>reintroduces argv-injection</strong>.</p>

<p>&nbsp;</p>

<h3>The fix</h3>
<p>Wraps the <code>.cmd</code> in <code>cmd.exe /d /s /c</code> with every argument passed as a <strong>discrete argv element</strong>.</p>

<p>&nbsp;</p>

<h3>Thanks to</h3>
<p><at id="0">Jamie Lee</at> for the original wrapper pattern; and <at id="1">Sam Chen</at> for filing the detailed repro.</p>

<p>&nbsp;</p>

<h3>Upgrade</h3>
<p><code>npm install @acme/widget@1.2.3</code></p>
```

## Error Handling

| Error | Resolution |
|-------|------------|
| No CHANGELOG.md | Fall back to `gh release view` |
| No GitHub release | Ask user to provide release notes or paste them |
| Channel not found | Ask user for exact team and channel name |
| 403 AclCheckFailed | Switch `az account` to corporate identity, retry |
| `GetUserPresence` 404 | UPN alias guess was wrong; ask user for correct UPN |
| Display name mismatch | Mention markup will render as plain text; confirm display name with the user before sending |
| Validation fails | Fix broken emoji entities or URLs, re-validate |
| Credential detected | Block send, alert user with findings |

## Composes With

- **git-commit** -- often invoked right before this skill (commit -> tag -> release -> announce)

