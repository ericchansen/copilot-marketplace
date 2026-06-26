# Global Copilot Instructions

## Git Workflow

- Never work on `main`/`master` — no commits, edits, or pushes, ever. Check `git branch --show-current` first; if on a default branch, create a worktree + feature branch (`<type>/<short-desc>`) and open a PR. Work inside the worktree; follow the repo's `AGENTS.md`/`CONTRIBUTING.md`.
- Run linters and tests after each logical change, not just at push time.
- Commits should tell a clear, readable history — someone reading the log later should understand what changed and why. If you make a series of fixes to work that isn't yet in `main`, rebase them into the commits they correct rather than leaving "fix" commits behind. Only add a separate fix commit when the code being fixed is already in `main`.
- Before pushing: run the linter and full test suite; run E2E against Edge (not Chrome) if present; scan the diff for secrets and PII; show `git diff origin/main..HEAD --stat` and get explicit user confirmation. Never push to a default branch, and never merge PRs — the user merges.
- Prefer linear history (rebase, `--ff-only`, squash WIP into one logical commit). Use `--force-with-lease` when rewriting already-pushed history.
- Multi-account auth: if a git/gh operation fails unexpectedly, run `gh auth status`, switch with `gh auth switch --user <account>`, and on SAML/SSO failures retry over HTTPS with `git -c credential.helper="!gh auth git-credential" <command>`.

## Environment

- Docker: never stop, remove, or modify other projects' containers; on a port conflict, change the current project's ports.
- Web dev servers: track which directory serves which port; with worktrees, confirm the browser is hitting the latest server, not a stale instance.

## Long-Running Compute

Before any process expected to run >10 minutes: confirm results save incrementally (read the code; fix if not), that it can be interrupted without losing completed work, and communicate an estimated runtime (smoke-test first if unknown).

## Verification

Verify the actual user experience before claiming success — open the URL, hit endpoints with real params, query the database, take a screenshot. An HTTP 200 or "tests pass" is not sufficient. If you can't fully verify, state exactly what you checked and what you couldn't.

## Security

- Never remove authentication from any app that handles PII — not even temporarily, not for demos.
- When unsure whether data is PII, assume it is.

## Autonomy

- Never ask what you could answer yourself — read the file, run the command, check the logs first.
- Never claim a project's tools or frameworks without reading its manifest (`package.json`, `pyproject.toml`, etc.).
- Burn tokens, not the user's patience.

## Citations

Every statistic or claim needs a clickable source URL (prefer Microsoft docs, Gartner, Forrester, peer-reviewed studies). Label projections clearly.
