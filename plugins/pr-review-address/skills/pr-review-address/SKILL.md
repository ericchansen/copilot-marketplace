---
name: pr-review-address
description: 'Review, address, and resolve PR feedback — examines all comments, review threads, and requested changes on a GitHub PR. Researches best practices, makes code fixes for valid feedback, pushes back with reasoned replies on items that are wrong or counterproductive, and resolves threads. Use when user says "address PR comments", "review the PR feedback", "fix PR review", "update PR", "handle review comments", or any variant of responding to pull request feedback.'
license: MIT
allowed-tools: Bash, PowerShell
---

# Address PR Review Feedback

Exercise engineering judgment on every comment — don't fix blindly.

## Step 1: Rebase onto Base Branch (GATE)

**Do this first — before reading feedback or making any changes.** Fixing code on a stale branch creates merge conflicts that waste time.

Check if the PR branch is behind its base (`main`/`master`). If behind, rebase now:

```bash
git fetch origin
git rebase origin/<base-branch>
```

If there are conflicts, resolve them, run build + tests to verify nothing broke, then force-push:

```bash
git push --force-with-lease
```

Do NOT proceed to Step 2 until the branch is current with the base branch.

## Step 2: Gather and Categorize Feedback

Fetch all review threads and PR comments. Categorize each:
- 🔴 **Bug/Security** — must fix
- 🟡 **Valid improvement** — should implement
- 🟢 **Style/preference** — implement if low-cost
- ⚪ **Disagree** — push back with explanation
- 🔵 **Question** — answer directly

For non-trivial comments, read the surrounding code and check best practices before acting.

## Step 3: Make Changes

For 🔴 and 🟡 items: fix, run build + tests. **Amend or rebase** existing commits rather than adding new fixup commits — the PR history should stay clean. Use `git commit --amend` or `git rebase -i` with `fixup`/`squash`, then `--force-with-lease` to push.

## Step 4: Reply to Every Thread

**Every piece of feedback gets a reply.** Use `addPullRequestReviewThreadReply` for review threads (NOT `gh pr comment`, which adds a general conversation comment):

```powershell
gh api graphql `
  -f query='mutation($threadId: ID!, $body: String!) {
    addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
      comment { id }
    }
  }' `
  -f threadId='PRRT_xxxxx' `
  -f body='Fixed in abc1234. Used generic error message instead of leaking internals.'
```

**Always use single-quoted strings** for `-f body=`. For bodies with single quotes, use the `create` tool to write a temp file, then `$replyBody = Get-Content "$env:TEMP\reply.md" -Raw`.

### Reply format — short and direct:
- **Fixed**: `Fixed in <sha>. <One sentence.>`
- **Disagree**: `<Why, with evidence. Be respectful but direct.>`
- **Question**: `<Direct answer in 1-2 sentences.>`
- **Deferred**: `Good catch. <Why out of scope>. Tracked in #<issue>.`

## Step 5: Resolve Every Thread

After replying to each thread, immediately resolve it:

```powershell
gh api graphql `
  -f query='mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) { thread { isResolved } }
  }' `
  -f threadId='PRRT_xxxxx'
```

Pushbacks get resolved too — your explanation IS the resolution.

### Fetching threads

```
gh api graphql -f query='{ repository(owner: "OWNER", name: "REPO") {
  pullRequest(number: NUM) { reviewThreads(first: 100) {
    pageInfo { hasNextPage endCursor }
    nodes { id isResolved comments(first: 1) { nodes { body path line } } }
  } } } }'
```

Paginate with `after: "CURSOR"` if `hasNextPage` is true.

## Step 6: Verify CI

Check CI status. If anything is failing, fix it before moving on. Always re-run build + tests after rebasing — even conflict-free rebases pull in base-branch changes that can break things.

## Step 7: Push and Summarize

Push, verify CI passes, then report:
- ✅ Fixed: N items | 💬 Replied: N | ❌ Pushed back: N
- 🔄 Branch updated: yes/no | 🏗️ CI: passing/failing | 🧵 Threads: all resolved
