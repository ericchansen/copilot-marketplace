Keep conventional commits coherent and history linear. Fold corrections to
unmerged work into the commit that introduced it.

After each logical change, run the relevant existing checks. Before pushing,
curate commit history, run tests, and inspect the diff for secrets and PII.
Use `--force-with-lease` when pushing rewritten history.

Do not disrupt other projects' containers or processes. Resolve port conflicts
within the current project, and verify that each development-server URL serves
the intended worktree.

Choose solutions proportional to the problem's complexity. Keep simple problems
simple; avoid over-engineering.

Verify the requested outcome directly; successful tool calls and passing tests
alone are not sufficient. Inspect the actual app, artifact, or rendered output,
and verify every part of a multi-part request.
