# copilot-marketplace

Personal multi-harness marketplace of independently installable skill plugins. The skills use
the open [Agent Skills](https://agentskills.io) `SKILL.md` format, so the same
plugins install across **GitHub Copilot CLI**, **Claude Code**, and **OpenAI
Codex**, and can be reused in **opencode**.

## Install

### GitHub Copilot CLI

Open Copilot CLI, then register this marketplace once:

```text
copilot
/plugin marketplace add ericchansen/copilot-marketplace
```

Install plugins individually:

```text
/plugin install doc-generator@copilot-marketplace
```

Replace `doc-generator` with any plugin name below.

### Claude Code

Claude Code reads `.claude-plugin/marketplace.json` (kept byte-identical to the
Copilot manifest):

```text
/plugin marketplace add ericchansen/copilot-marketplace
/plugin install doc-generator@copilot-marketplace
```

### OpenAI Codex

Codex reads the repo catalog at `.agents/plugins/marketplace.json`:

```text
codex plugin marketplace add ericchansen/copilot-marketplace
codex/plugins   # open the plugin browser, pick this marketplace, install a plugin
```

### opencode

opencode has no remote marketplace — it discovers skills from local directories.
To use a skill, copy (or symlink) its skill folder into a scanned path, e.g. into
your global config:

```bash
# copy one skill (repeat per skill you want)
cp -R plugins/doc-generator/skills/doc-generator ~/.config/opencode/skills/doc-generator
# or into a project you're working in:
cp -R plugins/doc-generator/skills/doc-generator .agents/skills/doc-generator
```

opencode reads `SKILL.md` from `.opencode/skills/`, `.claude/skills/`, and
`.agents/skills/` (project and `~/` global). It ignores the `allowed-tools`
field.

## Plugins

- `api-reverse-engineer` — Capture browser network requests through Chrome DevTools Protocol when a web UI is the only reliable API reference.
- `azure-doctor` — Diagnose and fix Azure deployments across repos, CI/CD pipelines, subscriptions, and service health.
- `clean` — Perform post-merge git cleanup by returning to main/master, pulling latest, deleting merged branches, pruning remotes, and verifying a clean state.
- `doc-generator` — Generate professional PDF and Word (DOCX) documents from markdown source files.
- `edge-browser` — Launch Microsoft Edge with a specific user profile and remote debugging enabled for CDP control.
- `foundry-image-gen` — Generate and edit images with GPT-Image-2, FLUX.2-flex, and MAI-Image-2.5-Pro in Microsoft Foundry.
- `git-code-review` — Run a structured closeout review over local, branch, commit, or PR diffs before shipping.
- `git-commit` — Curate conventional commits and autosquashed, rebase-ready history before pushes and PR updates.
- `git-safety-scan` — Scan staged changes or commits for sensitive data before pushing to remote.
- `github-writer` — Write PRs, issues, and comments for GitHub with encoding-safe body files and sanitized, structured content.
- `meeting-transcription` — Locally transcribe recorded meetings, identify speakers, and produce evidence-based meeting notes.
- `pr-review-address` — Address GitHub PR feedback with origin-targeted fixups, autosquashed history, thread replies, and resolution.
- `technical-writing` — Draft, review, and revise source-grounded technical documentation with STE-inspired clarity and meaning-preservation checks.
- `ti-2026-fantasy-advisor` — Recommend TI 2026 Fantasy roster, Title, and War Banner moves with token-aware local analysis.
- `visor` — Research vehicles end to end with supported Visor retrieval, deal evaluation, market context, and evidence-gated shortlists.

### Technical writing

The [technical-writing skill](plugins/technical-writing/skills/technical-writing/SKILL.md)
supports source-grounded drafts, read-only reviews, and focused revisions:

```text
Use technical-writing to draft a usage guide from this repository.
Review this runbook for ambiguity without editing files.
Revise this API reference while preserving requirements and exact identifiers.
```

The default is STE-inspired software clarity, not strict ASD-STE100 compliance.
An explicitly requested STE review requires an authorized source and reports its
coverage and limits. The plugin does not bundle the standard or dictionary and
does not claim ASD endorsement or certification. See its
[source and rights guidance](plugins/technical-writing/skills/technical-writing/references/ste-reference.md).

It needs no additional runtime packages. It includes a project glossary template
and synthetic behavioral cases with a
[maintainer evaluation protocol](plugins/technical-writing/skills/technical-writing/references/review-and-evaluation.md).
Use `doc-generator` separately when the finished Markdown needs PDF or DOCX export.

### Personal skill setup

The marketplace includes both `meeting-transcription` and
`ti-2026-fantasy-advisor`. Follow their bundled setup instructions:

- [Meeting transcription](plugins/meeting-transcription/skills/meeting-transcription/SKILL.md)
  requires PowerShell, `uv`, `ffmpeg`/`ffprobe`, an NVIDIA CUDA GPU, and access to
  the gated Hugging Face diarization models. Setup installs its Python environment
  outside the plugin; model downloads and transcription are separate runtime steps.
- [TI 2026 Fantasy Advisor](plugins/ti-2026-fantasy-advisor/skills/ti-2026-fantasy-advisor/tools/README.md)
  requires Node.js 20+ and no npm packages. It includes the MIT calculator,
  tests, and explicitly synthetic fixtures, but not historical match data:
  [upstream excludes that data from MIT](https://github.com/VirenDias/ti15-fantasy/blob/fff2663466b70cc8810d02cdbf495523098784e7/readme.md#licence).
  Real offline analysis requires separately permitted compatible JSON supplied
  with `--data`. See the tool README for setup and a fast smoke command.
  Live browser access is needed for the maintained helper and current tournament
  context, not for the bundled horizon analyzer.

After the version containing a skill is published, install it using that skill's
name in the harness-specific instructions above. For Copilot CLI or Claude Code:

```text
/plugin install meeting-transcription@copilot-marketplace
/plugin install ti-2026-fantasy-advisor@copilot-marketplace
```

Existing manually installed user skills are not migrated by this repository.
Keep the originals and any user-owned runtime environments until the marketplace
copy has been exercised in a fresh session. Then explicitly choose one active
copy per skill to avoid duplicate discovery; do not overwrite, delete, or repoint
an active skill as part of packaging. Recordings, transcripts, speaker maps,
screenshots, credentials, model weights, and caches must remain outside plugins.

## Repository structure

```text
.github/plugin/marketplace.json   Copilot CLI marketplace (source of truth)
.claude-plugin/marketplace.json   Claude Code marketplace (byte-identical mirror)
.agents/plugins/marketplace.json  Codex repo marketplace catalog
plugins/<name>/
  plugin.json                     Copilot/Claude plugin manifest
  .codex-plugin/plugin.json       Codex plugin manifest
  skills/<name>/SKILL.md          Agent Skills (agentskills.io) definition
```

Skill helper files live beside their `SKILL.md` files. The marketplace
manifests are kept in sync by the `Validate` workflow. `copilot-home/` holds the
portable user-level config (settings, MCP/LSP servers, instructions) deployed to
`~/.copilot/` via `copilot-home/link.ps1` — see `copilot-home/README.md`.
