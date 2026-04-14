---
name: pr-review-address
description: 'Review, address, and resolve PR feedback — examines all comments, review threads, and requested changes on a GitHub PR. Researches best practices, makes code fixes for valid feedback, pushes back with reasoned replies on items that are wrong or counterproductive, and resolves threads. Use when user says "address PR comments", "review the PR feedback", "fix PR review", "update PR", "handle review comments", or any variant of responding to pull request feedback.'
license: MIT
allowed-tools: Bash
---

# Address PR Review Feedback

When the user asks to address, review, fix, or respond to PR feedback, execute this complete workflow. Do NOT just fix things blindly — exercise engineering judgment on every comment.

## Step 1: Gather All Feedback

1. **Get the PR number and repo** from context (current branch, user message, or ask).
2. **Fetch ALL review threads** using `gh api` or GitHub MCP tools:
   - Review comments (inline code comments)
   - PR-level review comments
   - General PR comments (conversation tab)
   - Requested changes from reviewers
3. **Categorize each piece of feedback:**
   - 🔴 **Bug/Security** — Must fix. Code is wrong, unsafe, or will break.
   - 🟡 **Valid improvement** — Good suggestion, should implement.
   - 🟢 **Style/preference** — Optional, but reasonable. Implement if low-cost.
   - ⚪ **Disagree** — Reviewer is wrong, suggestion would make code worse, or misunderstands intent.
   - 🔵 **Question** — Needs clarification, not a change request.

## Step 2: Research Before Acting

For each non-trivial comment:
1. **Read the surrounding code** — understand the full context, not just the diff hunk.
2. **Check best practices** — use documentation tools (Context7, Microsoft Learn, etc.) to verify claims about APIs, patterns, or conventions.
3. **Check existing tests** — will the suggested change break anything?
4. **Check the PR description** — does the comment align with the stated goals?

## Step 3: Make Code Changes

For feedback categorized as 🔴 Bug/Security or 🟡 Valid improvement:
1. Make the fix in the correct file.
2. Run the build (`tsc`, `npm run build`, etc.) to verify no regressions.
3. Run tests if they exist.
4. Stage and commit with a clear message referencing the review:
   ```
   fix: address PR review — <summary of changes>
   ```

For 🟢 Style/preference items:
- Implement if the change is small and genuinely improves readability.
- Skip if it's purely subjective and adds churn.

## Step 4: Reply to Every Comment

**Every piece of feedback (review threads + general PR comments) gets a reply.** Never leave feedback unacknowledged.

**CRITICAL (review threads): Reply to each review thread individually using `addPullRequestReviewThreadReply`.**
Do NOT use `gh pr comment` when you intend to reply to a review thread — it adds a general conversation comment at the bottom of the PR, not a threaded reply. Each review thread must get its own inline reply so reviewers see responses in context.

**General PR comments (conversation tab):** For comments that are NOT part of a review thread (e.g., general discussion in the Conversation tab), reply using `gh pr comment` or the `addComment` mutation — these live in the conversation tab and cannot be replied to with `addPullRequestReviewThreadReply`.

### Reply mechanism

Use the `addPullRequestReviewThreadReply` GraphQL mutation to reply to each thread. Pass the body as a GraphQL **variable** (not interpolated into the query string) to avoid PowerShell encoding issues with backticks and special characters:

```powershell
gh api graphql `
  -f query='mutation($threadId: ID!, $body: String!) {
    addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
      comment { id }
    }
  }' `
  -f threadId='PRRT_xxxxx' `
  -f body='Fixed in abc1234. Used generic error message instead of str(e) to avoid leaking internals.'
```

**Encoding safety rules:**
- Always use **single-quoted strings** (`'...'`) for `-f body=` to prevent PowerShell backtick interpretation.
- If the reply body contains single quotes, write the body to a temp file using the **`create` tool** (NOT PowerShell `Out-File`), then read it back:
  ```
  # Step 1: Use the Copilot CLI create tool to write the file:
  #   create tool call:
  #     path: C:\Users\<you>\AppData\Local\Temp\reply.md
  #     file_text: |
  #       Fixed in abc1234. It's now safe to include single 'quotes' here.
  
  # Step 2: Read it back in PowerShell and pass to gh api:
  $replyBody = Get-Content "$env:TEMP\reply.md" -Raw
  gh api graphql -f query='...' -f threadId='PRRT_xxx' -f body=$replyBody
  Remove-Item "$env:TEMP\reply.md" -ErrorAction SilentlyContinue
  ```
- **NEVER** use double-quoted strings for bodies containing backticks — PowerShell interprets `` `n `` as newline, `` `a `` as BEL, etc.

### Reply format

Keep replies **short and direct**. One to two sentences max. No markdown headers, no bullet lists, no summary tables. The reply appears inline next to the code — treat it like a code review conversation, not a report.

### For items you FIXED:
```
Fixed in <commit-sha>. <One sentence explaining what changed.>
```
Example: `Fixed in a1b2c3d. Using generic error message instead of str(e) to avoid leaking exception details.`

### For items you DISAGREE with:
```
<One or two sentences explaining why with evidence. Be respectful but direct.>
```
Example: `This is intentional — the retry here covers Azure Flex cold-start which can take 60s+. Removing it would regress the fix for #54. See https://learn.microsoft.com/...`

Do NOT blindly agree. If a reviewer suggests something that would:
- Introduce complexity without proportional benefit
- Contradict the project's established patterns
- Be based on a misunderstanding of the code's purpose
- Hurt performance, readability, or maintainability

...then push back politely with a clear explanation. Good engineering requires defending good decisions.

### For questions:
```
<Direct answer in one or two sentences.>
```

### For items deferred (valid but out of scope):
```
Good catch. <Why it's out of scope for this PR>. Tracked in #<issue> / will follow up separately.
```

## Step 5: Reply + Resolve Each Thread

**CRITICAL: Every thread gets a reply AND a resolve.** Process them one at a time: reply, then immediately resolve.

### Per-thread workflow

For EACH thread that lacks a reply from you (whether resolved or unresolved):

```powershell
# 1. Reply to the thread
gh api graphql `
  -f query='mutation($threadId: ID!, $body: String!) {
    addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
      comment { id }
    }
  }' `
  -f threadId='PRRT_xxxxx' `
  -f body='Fixed in a1b2c3d. Used generic error message instead of leaking exception details.'

# 2. Immediately resolve it
gh api graphql `
  -f query='mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread { isResolved }
    }
  }' `
  -f threadId='PRRT_xxxxx'
```

### Resolution rules

After replying:
1. If you **fixed it** → resolve the thread.
2. If you **explained why it's intentional / pushed back** → resolve the thread. Your explanation IS the resolution. Don't leave it hanging — especially for automated reviewers (Copilot, bots) where there's no human to "come back and check."
3. If you **partially addressed** → reply explaining what's done and what's deferred, then resolve. The reply documents the gap.
4. If you **answered a question** → resolve the thread.

### Getting thread data

Fetch all threads with their node IDs and first comment body (handles up to 100 threads; for larger PRs, paginate using `after: endCursor`):
```
gh api graphql -f query='{
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR_NUMBER) {
      reviewThreads(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes { id isResolved comments(first: 1) { nodes { body path line } } }
      }
    }
  }
}'
```

If `hasNextPage` is `true`, re-run the query adding `after: "CURSOR_VALUE"` to `reviewThreads(first: 100, after: "...")` until all threads are fetched.

### Anti-patterns

```powershell
# ❌ NEVER — gh pr comment when replying to a review thread
gh pr comment 53 --body "Here's what I fixed: ..."
# This adds a comment to the conversation tab, NOT inline on the review thread
# (gh pr comment IS correct for replying to general conversation-tab comments)

# ❌ NEVER — one summary reply covering all threads
gh pr comment 53 --body "Addressed all feedback: 1) Fixed X, 2) Fixed Y, 3) Pushed back on Z"
# Each thread must get its own individual reply

# ❌ NEVER — double-quoted body with backticks
gh api graphql -f body="Fixed in `abc123`"
# PowerShell interprets `a as BEL character — use single quotes
```

## Step 6: Fix CI/CD Failures

**Always check CI status on the PR.** Review comments are only half the picture — failing checks block merge.

**Also check branch mergeability / base-branch drift.** A PR with green checks can still be blocked if GitHub shows "This branch is out-of-date with the base branch" or `mergeable_state` is `behind`.

1. **Get check run status:**
   ```
   gh api repos/OWNER/REPO/commits/$(git rev-parse HEAD)/check-runs --jq '.check_runs[] | "\(.name) \(.conclusion)"'
   ```
   Or use the GitHub MCP `get_check_runs` tool on the PR.

2. **For failed checks, get the logs:**
   ```
   gh api repos/OWNER/REPO/actions/jobs/JOB_ID/logs
   ```
   Or use `get_job_logs` with `return_content: true` and `tail_lines: 100`.

3. **Common CI failures after PR review fixes:**
   - **Test timeouts** — New code paths hit external services (APIs, CLIs) that aren't mocked. Add mocks.
   - **Type errors** — Review-driven type changes break downstream tests that used the old types.
   - **Lint failures** — New code doesn't match project style rules. Run the linter locally.
   - **Build failures** — Missing imports, circular dependencies after refactoring.
   - **Version matrix failures** — Passes on one Node/Python/etc. version but fails on another. Check the matrix.

4. **Fix, test locally, push:**
   - Run the exact CI command locally (e.g., `npm run build && npm run test`).
   - Verify ALL matrix variants pass if possible (`node 20` + `node 22`, etc.).
   - Push the fix — CI will re-run automatically.

5. **If CI was already failing before your PR** (pre-existing failure):
   - Note this in a PR comment so reviewers know it's not your regression.
   - Fix it anyway if it's small — bonus points for leaving the repo better than you found it.

6. **If the PR branch is behind the base branch:**
   - Treat this as part of addressing the PR, not as a separate manual task for the user.
   - Fetch the latest base branch and update the PR branch yourself.
   - Prefer `git rebase origin/<base>` for a clean linear history unless the repo specifically prefers merge commits or the rebase is risky/conflicted.
   - Re-run the relevant validations after rebasing/merging.
   - Push the updated branch so GitHub clears the "out-of-date" state and re-runs checks if needed.

## Step 7: Push and Summarize

1. Push the fix commit(s) to the PR branch.
2. Verify CI passes after your push (check run status).
3. Provide a summary to the user:
   - ✅ Fixed: <count> items
   - 💬 Replied (no change needed): <count> items  
   - ❌ Pushed back (with explanation): <count> items
   - 🔄 Branch updated: yes / no
   - 🏗️ CI: passing / still failing (with details)
   - 🧵 Threads: all resolved / <count> unresolved (explain why)

## Anti-Patterns to Avoid

- **DO NOT** make every suggested change without thinking. Reviewers can be wrong.
- **DO NOT** reply with just "Fixed" without saying what changed.
- **DO NOT** leave comments unacknowledged — silence looks like ignoring feedback.
- **DO NOT** leave threads unresolved after replying — reply + resolve is the complete action. Even pushbacks get resolved; your explanation is the resolution.
- **DO NOT** make unrelated changes while addressing review feedback.

## Edge Cases

- **Conflicting reviewer opinions**: Note both perspectives, pick the approach that best serves the codebase, explain your choice.
- **Outdated comments**: If the code has already changed and the comment no longer applies, reply noting it's been addressed by a different change and resolve.
- **Nitpicks on generated code**: If the comment targets auto-generated or vendored code, explain that the file is generated and shouldn't be manually modified.
