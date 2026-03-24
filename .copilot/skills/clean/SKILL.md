---
name: clean
description: 'Post-merge git cleanup — checkout main/master, pull latest, delete merged local branches, prune remote-tracking branches, clean up worktrees, verify clean working state. Use when user says "clean up", "rebased and merged", "merged, clean up", "cleanup branches", "back to main", or any variant of post-merge housekeeping.'
license: MIT
allowed-tools: Bash
---

# Post-Merge Git Cleanup

When the user signals a merge is complete and wants cleanup, execute this workflow. Be concise — report what you did, not what you're about to do.

## Workflow

### 1. Identify current state

```bash
git branch --show-current
git status --short
git worktree list
```

Note the current branch name — if it's not main/master, this is the branch that was just merged.

**Check if we're inside a worktree:**

```bash
git rev-parse --git-common-dir 2>/dev/null
```

If the output differs from `.git`, we're in a worktree (linked checkout), not the main repo.

### 2. Handle worktree cleanup

If `git worktree list` shows worktrees beyond the main checkout, check whether any are on branches that have been merged.

**If we're currently inside a worktree:**
1. Identify the worktree path and branch:
   ```bash
   WORKTREE_PATH=$(pwd)
   WORKTREE_BRANCH=$(git branch --show-current)
   MAIN_REPO=$(git worktree list | head -1 | awk '{print $1}')
   ```
2. Check if the branch has been merged (PR merged on GitHub):
   ```bash
   gh pr list --head "$WORKTREE_BRANCH" --state merged --json number,title --jq '.[0]'
   ```
3. If merged: `cd` to the main repo, then remove the worktree and branch:
   ```bash
   cd "$MAIN_REPO"
   git worktree remove "$WORKTREE_PATH"
   git branch -d "$WORKTREE_BRANCH"
   ```
4. Continue the rest of the workflow from the main repo.

**If we're in the main repo** but worktrees exist:
1. For each worktree (skip the main one), check if its branch was merged:
   ```bash
   git worktree list --porcelain | grep -E '^worktree |^branch ' | paste - - | while read wt_line br_line; do
     wt_path=${wt_line#worktree }
     branch=${br_line#branch refs/heads/}
     merged=$(gh pr list --head "$branch" --state merged --json number --jq 'length')
     if [ "$merged" -gt 0 ]; then
       echo "MERGED: $wt_path ($branch)"
     fi
   done
   ```
2. Prompt the user before removing merged worktrees — worktrees may contain untracked files or artifacts the user wants to keep.
3. For approved removals:
   ```bash
   git worktree remove <path>
   git branch -d <branch>
   ```

### 3. Stash or warn about uncommitted changes

If `git status --short` shows uncommitted changes:
- **If on a feature branch that was merged:** warn the user that there are uncommitted changes on the merged branch and ask if they want to discard them before switching.
- **If changes are trivial (untracked files only):** proceed.

### 4. Switch to the default branch

Detect the default branch name:

```bash
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'
```

If that fails, try `main` then `master`. Checkout and pull:

```bash
git checkout <default-branch>
git pull --ff-only
```

If `--ff-only` fails, use `git pull --rebase` and report it.

### 5. Delete merged branches

Delete local branches that have been merged into the default branch:

```bash
git branch --merged | grep -vE '^\*|^  (main|master|develop)$' | xargs git branch -d 2>/dev/null || true
```

On Windows (PowerShell), use:

```powershell
git branch --merged | Where-Object { $_ -notmatch '^\*' -and $_.Trim() -notmatch '^(main|master|develop)$' } | ForEach-Object { git branch -d $_.Trim() }
```

**Note:** Branches checked out in worktrees cannot be deleted until the worktree is removed. If `git branch -d` fails with "checked out in another worktree", the worktree step above should have handled it. If not, report the stuck branch to the user.

### 6. Prune remote tracking branches

```bash
git fetch --prune
```

### 7. Report results

Print a brief summary:

```
✅ Cleaned up
  Branch: main @ <short-sha>
  Deleted: feat/my-branch, fix/other-branch (or "none")
  Worktrees removed: ../q2mm-immutable-ff (or "none" / "n/a")
  Working tree: clean (or list remaining untracked files)
```

Keep the output tight — this is a routine operation.

### 7. Suggest next steps

After cleanup, briefly surface what's actionable. Check these sources (in parallel when possible):

1. **Open PRs**: `gh pr list --state open --limit 5` — mention any awaiting review/merge
2. **Open issues**: `gh issue list --state open --limit 5` — mention unaddressed issues
3. **Changesets bot PR**: if `changeset-release/main` branch exists, note a release is pending
4. **Session plan**: if `plan.md` exists in the session workspace, check for incomplete tasks
5. **Session todos**: query the SQL `todos` table for pending/in-progress items

Synthesize into 2–4 bullet points under a `📋 Next steps:` heading. Use your judgement — only surface items that are genuinely actionable right now. Skip anything already done or blocked on external factors. Example:

```
📋 Next steps:
  • Merge Changesets release PR #36 to publish @wingmanjs/core@0.2.2
  • Issue #42 (add retry logic) is unassigned — pick it up?
  • 2 pending todos in session plan: "write integration tests", "update changelog"
```

If everything is clean and there's nothing pending, just say "Nothing pending — you're all caught up." Don't invent busywork.
