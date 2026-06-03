# Global Copilot Instructions

## Git Workflow

**Commit prefixes:** `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `ci`, `perf`

### Branching — Worktrees First

- **🚫 NEVER work on `main` or `master`** — no commits, edits, staged files, or pushes. No exceptions, not even for "small" changes or deprecated repos. If the user's request implies it, create a worktree and PR instead.
- Check `git branch --show-current` at the start of every task. If on `main`/`master`:
  ```bash
  git fetch origin && git worktree add ../repo-name-branch -b <type>/<short-description> origin/main
  ```
- Work entirely inside the worktree directory. Follow repo-specific instructions (AGENTS.md, CONTRIBUTING.md) when present.

### During Development

- Run relevant checks after each logical change — catch failures early, don't defer everything to push time.
- Commit frequently with clear messages. Use the `git-commit` skill.

### Before Any Push

1. Run linter and full test suite (not just affected tests)
2. If the repo has E2E tests, run them locally against **Edge** (not Chrome) before pushing
3. Invoke the `git-safety-scan` skill — scans for secrets, PII, and `~/.copilot/sensitive-terms.txt` blocklist
4. Show `git diff origin/main..HEAD --stat` to the user — they must review and explicitly confirm before push
5. Push to a feature branch, never directly to `main`/`master`. Offer to create a PR afterward.

Do not merge PRs — only the user merges.

### Clean Commit History

- Prefer linear history — `git rebase`, `git merge --ff-only`, "Rebase and merge" for PRs
- Squash WIP commits before merging: one logical change = one commit
- Use `--force-with-lease` if rewriting already-pushed history

### Creating PRs and Issues

Use the `gh-writer` skill for any `gh` command that writes content (PRs, issues, comments). It prevents PowerShell encoding corruption and enforces content quality (no machine-specific paths, structured sections, generic repro steps).

### Multi-Account Git Authentication

Multiple GitHub accounts are configured (enterprise EMU + personal). When any git/gh operation fails unexpectedly:
1. Run `gh auth status` — check which account is active
2. Switch if wrong: `gh auth switch --user <account>`
3. If auth looks right but org repos still fail, suspect SSH/SAML — retry via HTTPS: `git -c credential.helper="!gh auth git-credential" <command>`

## Environment

- **Docker**: Never stop, remove, or modify containers from other projects. If port conflicts occur, change the current project's ports.
- **Web dev servers**: Track which directory is served on which port. With worktrees, confirm the user's browser is hitting the server with the latest changes, not a stale instance.
- **Azure naming**: `<type>-<app>-<env>` (e.g., `rg-itemwise-prod`). Never use bare `prod` or `dev`.
- **Azure demo subscriptions**: MCAPS Managed Environment subs follow the pattern `ME-MngEnv*`. Always check these first for demo deployments. Find with: `az account list --query "[?starts_with(name,'ME-MngEnv')].name" -o tsv`

## Long-Running Compute

Before launching any process expected to run **>10 minutes**:
1. **Read the code** to verify results save incrementally, not just at exit. Fix if needed.
2. Confirm the process can be safely interrupted without losing completed work.
3. Communicate estimated runtime. If unknown, run a smoke test first.

## VM Change Protocol — Stateful Agent VMs

When SSHing into a stateful agent VM (OpenClaw or any system that maintains its own workspace memory), changes you make are invisible to the agent until its next session boot — and even then, only if you leave a written trail. **Always** follow this sequence on a target VM that has `openclaw-vm-verify` and `openclaw-vm-changelog` installed:

```bash
# 1. Snapshot the files/units you're about to touch (keep a rollback baseline locally)
# 2. Make the change
# 3. Verify nothing broke
openclaw-vm-verify

# 4. Log the change (writes to today's memory/YYYY-MM-DD.md so the agent sees it)
openclaw-vm-changelog \
  --verify-first \
  --summary "Short headline of what changed" \
  --details "Multi-line body: what, why, where to roll back if needed" \
  --tools-md "Heading|Durable fact (e.g., new path, port, service, env var)" \
  --wake  # only for urgent changes (security, breakage, anything affecting a running task)
```

If `openclaw-vm-verify` fails, **roll back before logging**. Logging a "successful" change while verify is red poisons the agent's memory with false context.

If the VM doesn't have those helpers installed yet, install them first (see the helpers' source under `~/.copilot/session-state/.../files/vm-helpers/` in any session that built them), or append a manual entry to `~/.openclaw/workspace/memory/$(date +%Y-%m-%d).md` with the heading `## HH:MM — VM-CHANGE: <summary>`.

**Rule:** No silent VM changes. The agent rebuilds its mental model from files each session; if it can't read what you did, it'll work from stale assumptions.

## Verification

Before claiming something works, **verify the actual user experience** — not just exit codes or health checks. Open the URL, hit the endpoints with real params, query the database, take a screenshot. An HTTP 200 or "tests pass" alone is not sufficient. If you can't fully verify, state exactly what you checked and what you couldn't.

## Security

- Never suggest removing authentication from any app that handles PII — not even temporarily, not for demos.
- When in doubt whether data is PII, assume it is.

## Autonomy — Check Before Asking or Claiming

- **Never ask the user a question you could answer yourself** — read the file, run the command, check the logs first.
- **Never claim which tools or frameworks a project uses without reading the manifest** (`package.json`, `pyproject.toml`, etc.). Don't guess from config file format.
- The user's time is more valuable than your tool calls. Burn tokens, not patience.

## Citations

Every statistic or claim needs a clickable source URL. Prefer Microsoft docs, Gartner, Forrester, peer-reviewed studies. Label projections clearly.
