---
name: gh-writer
description: "MANDATORY for any gh CLI command that writes content: gh pr create, gh pr edit, gh issue create, gh issue edit, gh issue comment. Prevents PowerShell encoding corruption AND enforces content quality (no machine-specific paths, generic repro steps, structured sections). Triggers: create PR, open pull request, edit PR, create issue, edit issue, comment on issue, push and create PR, gh pr, gh issue, file a bug, open a bug."
license: MIT
allowed-tools: Bash, PowerShell
---

# GitHub Content Writer

Write PRs, issues, and comments using `gh` CLI with encoding safety AND content quality enforcement.

## When to Use

**MANDATORY** whenever writing content to GitHub:
- `gh pr create` / `gh pr edit`
- `gh issue create` / `gh issue edit`
- `gh issue comment`
- Any `gh` command with `--body` or that produces markdown content

## Workflow

### 1. Verify GitHub Account

Check the active account matches the target repo:
```powershell
gh auth status
```
Switch if needed (see Multi-Account Git Authentication in copilot-instructions.md).

### 2. Compose the Content

**ALWAYS use the `create` tool** to write the body file directly. This bypasses PowerShell encoding entirely and is the only reliable method for all Unicode characters.

Choose a temp file path and use it consistently in steps 2-5:
```powershell
$bodyFile = "$env:TEMP\gh-body-$(Get-Random).md"
```

Then use the `create` tool to write content to that exact path. Do NOT use PowerShell to write the content (it corrupts encoding).

### 3. Content Quality Rules

Before writing the file, review your content against these rules:

#### Encoding Safety
- **Never** use `--body "..."` inline -- PowerShell corrupts backticks and special chars
- **Never** use double-quoted here-strings (`@"..."@`) -- they allow backtick escaping
- **Always** write via the `create` tool to a temp file, then use `--body-file`
- **Avoid non-ASCII** when possible: use `--` instead of em-dash, `->` instead of arrows

#### No Machine-Specific Content
- **Never** include real usernames, machine names, or user-specific paths
  - Bad: `C:\Users\erichansen\.copilot\config.json`
  - Good: `~/.copilot/config.json`
- **Never** reference specific plugin/repo names from the user's system as if they're universal
  - Bad: "Tested with `copilot-config` plugin"
  - Good: "Tested with a local plugin (`marketplace: \"local\"`)"
- **Never** include real TPIDs, opportunity IDs, email addresses, or customer names
- Use generic placeholders: `owner/repo`, `my-plugin`, `<name>`, `example.com`

#### Structured Sections (for bug reports/issues)

Bug reports MUST include:
```markdown
### Environment
- **CLI/tool version:** (get this programmatically, don't guess)
- **OS:** (e.g., Windows 11, macOS 14)
- **Shell:** (e.g., PowerShell 7, zsh)

### Steps to Reproduce
1. (Generic, reproducible steps anyone can follow)
2. (Use placeholder names, not real ones)

### Expected Behavior
(What should happen)

### Observed Behavior
(What actually happens -- include evidence like tables, error messages)
```

Optional sections (include when helpful):
- `### Impact` -- who/what is affected
- `### Suggested Fix` -- if you have a concrete suggestion
- `### Related` -- links to related issues/PRs

#### Version Info
- Always include the tool/CLI version in the Environment section
- Get it programmatically (`copilot --version`, `node --version`, etc.)
- Don't guess or hardcode versions

### 4. Execute the gh Command

```powershell
# Create issue
gh issue create --repo owner/repo --title "Bug: short description" --body-file $bodyFile

# Edit issue
gh issue edit <number> --repo owner/repo --body-file $bodyFile

# Comment on issue
gh issue comment <number> --repo owner/repo --body-file $bodyFile

# Create PR
gh pr create --title "<type>: <description>" --body-file $bodyFile --base main

# Edit PR
gh pr edit <number> --body-file $bodyFile
```

### 5. Clean Up

```powershell
Remove-Item $bodyFile -ErrorAction SilentlyContinue
```

## PR Body Format

```markdown
## Summary

Brief description of what this PR does and why.

### Changes

- Grouped bullet list of changes
- With `inline code` for file/function names

### Testing

- How it was tested
- Test results (e.g., "261 tests pass")
```

## Issue Title Conventions

- Bug reports: `Bug: <concise description of what's wrong>`
- Feature requests: `Feature: <concise description of desired behavior>`
- Include version when relevant: `Bug: X does not work on v1.2.3`

## Critical Rules

1. **ALWAYS** use `--body-file` via the `create` tool -- no exceptions
2. **NEVER** include machine-specific info -- sanitize before writing
3. **ALWAYS** include version info in bug reports -- get it programmatically
4. **ALWAYS** use generic placeholders in reproduction steps
5. **REVIEW** content for PII/internal data before posting -- treat this as a public-facing communication
