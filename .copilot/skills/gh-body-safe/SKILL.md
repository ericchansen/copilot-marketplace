---
name: gh-body-safe
description: 'MANDATORY for any gh CLI command with a --body flag: gh pr create, gh pr edit, gh issue create, gh issue edit. Prevents PowerShell encoding bugs that silently corrupt markdown (backticks become \^G, em-dashes garble). Always writes body to a temp file and uses --body-file instead. Triggers: create PR, open pull request, edit PR, create issue, edit issue, push and create PR, gh pr, gh issue.'
license: MIT
allowed-tools: Bash
---

# GitHub PR & Issue Creator (PowerShell-Safe)

Create PRs, edit PR bodies, and create issues using `gh` CLI without markdown corruption. **Never use inline `--body` — always use `--body-file`.**

## Workflow

### 1. Verify GitHub Account

Verify the active account matches the repo (see Multi-Account Git Authentication in copilot-instructions.md).

### 2. Compose the Body

Use a single-quoted here-string (`@'...'@`) — it treats everything as literal text:

```powershell
$body = @'
## Summary
Brief description of what this PR does and why.
- Change with `inline code` preserved
- Referencing commit `abc1234`
'@
```

### 3. Write to Temp File and Execute

**Preferred:** Use the `create` tool to write the file — bypasses PowerShell's encoding entirely.

**Fallback:** PowerShell here-string (avoid non-ASCII characters with this method):
```powershell
$bodyFile = "$env:TEMP\gh-body-$(Get-Random).md"
$body | Out-File -FilePath $bodyFile -Encoding utf8NoBOM
```

### 4. Run the gh Command

```powershell
gh pr create --title "<type>: <description>" --body-file $bodyFile --base main
# Also works with: gh pr edit, gh issue create, gh issue edit
Remove-Item $bodyFile -ErrorAction SilentlyContinue
```

## Rules

- **Never** use `--body "..."` with backticks — PowerShell interprets `` `a `` as BEL, `` `n `` as newline
- **Never** use double-quoted here-strings (`@"..."@`) — they allow backtick escaping and variable expansion
- Prefer single-quoted `@'...'@` — only use `@"..."@` when you need `$variable` interpolation
- PR body format: short summary, grouped bullet list, footer with testing status if applicable
