---
name: code-review
description: 'Run a structured closeout code review on local, branch, commit, or PR changes before commit or ship. Verifies findings against the real code, fixes at the right ownership boundary, and reruns until clean. Use when the user says "review my code", "code review", "closeout review", "review this branch/PR", "review before I push", or asks for a second pass after non-trivial edits.'
license: MIT
allowed-tools: Bash, PowerShell, Task
---

# Code Review

Run a structured review as a closeout check before commit, push, or ship. Treat review output as **advisory** — never apply it blindly.

## When to Use

- User asks for a code review, closeout review, or a second pass.
- After non-trivial code edits, before final commit / push / PR.
- Reviewing a local branch, a single commit, or a PR branch after fixes.

## Step 1: Pick the Target

Review the actual diff, not the whole tree. Choose the narrowest target that covers the change.

**Uncommitted local work** (unstaged + staged + untracked):
```bash
git status --short
git --no-pager diff
git --no-pager diff --staged
git ls-files --others --exclude-standard   # untracked files — read these directly
```
`git diff` does not show untracked file contents, so list them explicitly and read the new files. A clean local review only proves there is no local patch — it says nothing about already-committed work.

**Branch / PR work** — diff against the base, not the tree. Fetch, then resolve a full **base ref** (don't assume `main` — this repo and others default to `master`):

```bash
git fetch origin
```
- If a PR exists: the base ref is `origin/` + the output of `gh pr view --json baseRefName --jq .baseRefName` (e.g. `origin/master`).
- Otherwise the repo's default branch ref comes from `git symbolic-ref --short refs/remotes/origin/HEAD`, which returns a full ref like `origin/master` (or read the "HEAD branch" line from `git remote show origin`).

Then substitute the resolved base ref into the diff command:
```bash
git --no-pager diff origin/master...HEAD
# or: git --no-pager diff origin/main...HEAD
```
If the default branch can't be resolved, ask the user for the base rather than guessing.

**Already-committed single change:**
```bash
git --no-pager show <ref>      # e.g. HEAD
```
Use commit review for landed/pushed work. Reviewing a clean `main` against `origin/main` is usually an empty diff — review the commit or the branch instead.

> Do not push just to review. Push only when the user asked to push / ship / update a PR.

## Step 2: Run the Review

Run the review against the target diff using the built-in **`code-review`** sub-agent — invoke the `task` tool with `agent_type: code-review` (this is the built-in reviewer agent, **not** a recursive call to this skill). For changes that touch auth, input handling, secrets, crypto, file/network access, or permissions, **also** invoke `task` with `agent_type: security-review` against the same diff.

The sub-agents **return findings only — they do not modify code**. This skill verifies findings and applies any fixes.

Give the reviewer the diff plus enough context to verify against real code:
- the diff or commit range from Step 1, and the list of changed files
- the focused test command for the area, if one exists
- any reviewer notes the user provided
- an instruction to report only high-confidence, actionable issues verified against the code

Regular `code-review` should always flag obvious security regressions. A dedicated `security-review` pass is **required** when the diff touches the sensitive areas above. Either way, security findings must not cripple legitimate functionality — report one only when the change creates a concrete, actionable risk or removes a real safety check.

## Step 3: Verify Every Finding

The review is a list of hypotheses, not a task list.

- **Verify every accepted finding** by reading the real code path and adjacent files before changing anything.
- Read dependency docs / source / types when a finding depends on external behavior.
- **Reject** unrealistic edge cases, speculative risks, broad rewrites, and fixes that over-complicate the codebase. Note briefly why.
- Prefer the **smallest fix at the right ownership boundary**. No refactor unless it clearly improves the bug class.
- When an accepted finding reveals a bug **class** or repeated pattern, check the current change's scope for sibling instances and fix them together — stop at touched surfaces and owner boundaries; leave clear follow-up territory alone.
- If rejecting a finding as intentional, add a brief inline code comment **only** when it documents a real invariant or ownership decision a future reviewer should know.

## Step 4: Rerun Until Clean

If a review-triggered fix changes code:
1. Rerun the focused tests for the area.
2. Rerun the review on the updated diff.

Keep going until the review returns **no accepted/actionable findings**. Once that happens, **stop** — do not run another review just to get a nicer "clean" line or a second opinion. Treat "review completed with no actionable findings" as the clean result.

When formatting can change line locations, format **first**, then it is safe to run tests and the review against stable line numbers.

## Step 5: Final Report

Report:
- **Target reviewed** — the diff / commit range / PR base.
- **Tests/proof run** — commands and result.
- **Findings** — accepted vs rejected, one line each on why.
- **Result** — the clean review outcome, or why a remaining finding was consciously rejected.

Do not run an extra review solely to improve the wording of this report.
