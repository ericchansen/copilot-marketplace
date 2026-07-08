# Global Copilot Instructions

## Git Workflow

- Never work on `main`/`master` — no commits, edits, or pushes, ever. Check `git branch --show-current` first; if on a default branch, create a worktree + feature branch (`<type>/<short-desc>`) and open a PR. Work inside the worktree; follow the repo's `AGENTS.md`/`CONTRIBUTING.md`.
- Run linters and tests after each logical change, not just at push time.
- Clean commits mean the merged history reads as if the work were done right the first time: each commit is one coherent, self-contained, conventionally-formatted change, and someone reading the log later understands what changed and why. Never leave a commit that fixes, tweaks, or reverts something another commit in the same *unmerged* PR introduced — rebase that fix back into the commit at fault (squash WIP / "address review" / "oops" noise the same way). A standalone fix commit is only correct when the code it corrects is already on `main`.
- Before pushing: run the linter and full test suite; run E2E against Edge (not Chrome) if present; scan the diff for secrets and PII; show `git diff origin/main..HEAD --stat` and get explicit user confirmation. Never push to a default branch, and never merge PRs — the user merges.
- Prefer linear history (rebase, `--ff-only`, squash WIP into one logical commit; `--force-with-lease` when rewriting already-pushed history).
- Do this curation automatically before every push, PR open, or review update — never wait to be asked; fold the check into the pre-push confirmation step rather than raising it as its own question.
- Multi-account auth: if a git/gh operation fails unexpectedly, run `gh auth status`, switch with `gh auth switch --user <account>`, and on SAML/SSO failures retry over HTTPS with `git -c credential.helper="!gh auth git-credential" <command>`.

## Environment

- Docker: never stop, remove, or modify other projects' containers; on a port conflict, change the current project's ports.
- Web dev servers: track which directory serves which port; with worktrees, confirm the browser is hitting the latest server, not a stale instance.

## Long-Running Compute

Before any process expected to run >10 minutes: confirm results save incrementally (read the code; fix if not), that it can be interrupted without losing completed work, and communicate an estimated runtime (smoke-test first if unknown).

## Verification

Before reporting an action complete, confirm the observable result matches what was
asked — don't just trust that a tool returned "success." Applies to every action type:

- Code/deploy: open the URL, hit endpoints with real params, query the DB, screenshot.
  HTTP 200 or "tests pass" is not proof.
- Artifacts & UI (files, canvases, docs, slides): confirm the thing actually rendered
  the intended content at the path/panel the user sees — open it and read it back,
  verify it's not empty, stale, or written to the wrong location.
- Multi-part requests: re-read the original ask and check off each part before summarizing.

If you can't fully verify, state exactly what you checked and what you couldn't. If you
catch your own mistake, fix it before reporting — never hand back a result you know is broken.

## Security

- Never remove authentication from any app that handles PII — not even temporarily, not for demos.
- When unsure whether data is PII, assume it is.

## Autonomy

- Never ask what you could answer yourself — read the file, run the command, check the logs first.
- Never claim a project's tools or frameworks without reading its manifest (`package.json`, `pyproject.toml`, etc.).
- Burn tokens, not the user's patience.

## Citations

Every statistic or claim needs a clickable source URL (prefer Microsoft docs, Gartner, Forrester, peer-reviewed studies). Label projections clearly.
