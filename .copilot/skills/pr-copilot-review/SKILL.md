---
name: pr-copilot-review
description: 'After creating a PR, poll for GitHub Copilot automated review and address it. Detects whether the repo has Copilot auto-reviews enabled, waits for the review to arrive, then invokes pr-review-address to handle feedback. Triggered automatically after PR creation — do not wait for the user to ask.'
license: MIT
allowed-tools: Bash
---

# Auto-Address Copilot PR Reviews

After a PR is created, automatically check for GitHub Copilot automated reviews and address them without waiting for the user to ask.

## When to Invoke

**Automatically, immediately after any `gh pr create` succeeds.** This skill is part of the PR creation chain:

```
git-commit → git-safety-scan → gh-body-safe (PR create) → pr-copilot-review → pr-review-address
```

Do NOT wait for the user to say "check for reviews" or "address comments." If a PR was just created, invoke this skill proactively.

## Workflow

### Step 1: Check for Copilot Auto-Review

After `gh pr create` returns the PR URL/number, wait briefly then check for automated reviews:

```bash
# Initial wait — Copilot reviews typically arrive within 30-60 seconds
sleep 20

# Check for bot/Copilot reviews on the PR
OWNER="<owner>"
REPO="<repo>"
PR_NUMBER="<number>"

gh api repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews \
  --jq '[.[] | select(.user.login == "copilot-pull-request-reviewer" or (.user.type == "Bot" and .state != "APPROVED"))] | length'
```

### Step 2: Poll if Needed

If no reviews found on the first check, poll up to 3 more times:

```bash
for i in 1 2 3; do
  sleep 20
  count=$(gh api repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews \
    --jq '[.[] | select(.user.login == "copilot-pull-request-reviewer" or (.user.type == "Bot" and .state != "APPROVED"))] | length')
  if [ "$count" -gt 0 ]; then
    echo "Copilot review found"
    break
  fi
done
```

Total polling time: ~80 seconds max (4 checks × 20s). This is acceptable — Copilot reviews rarely take longer.

### Step 3: Branch Based on Result

**If Copilot review is found:**
- Invoke the `pr-review-address` skill immediately
- Do NOT ask the user — just address the review
- Follow the full pr-review-address workflow (gather, categorize, fix/pushback, reply, resolve threads, verify CI)
- Report the summary to the user when done

**If no review after ~80 seconds:**
- Stop polling
- Report briefly: "No Copilot auto-review detected — PR is ready for human review."
- Do NOT keep polling indefinitely

### Step 4: Handle Non-Copilot Bot Reviews

If the repo uses other review bots (e.g., `github-actions[bot]`, custom bots), treat them the same way:
- If they leave actionable review comments → address via `pr-review-address`
- If they only post status checks or informational comments → ignore (CI status is handled separately)

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `gh-body-safe` | **Upstream** — creates the PR that triggers this skill |
| `pr-review-address` | **Downstream** — does the actual review addressing work |
| `git-safety-scan` | **Upstream** — runs before push, before PR creation |
| `git-commit` | **Upstream** — commits the code that gets pushed and PR'd |

## Anti-Patterns

- **DO NOT** ask the user "should I check for Copilot reviews?" — just do it
- **DO NOT** poll forever — 80 seconds max, then move on
- **DO NOT** skip this step because "the user didn't ask" — it's automatic
- **DO NOT** invoke this skill for `gh pr edit`, `gh issue create`, or other non-PR-creation commands
