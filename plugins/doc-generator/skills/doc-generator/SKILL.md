---
name: doc-generator
description: |
  Generate professional PDF and Word (DOCX) documents from markdown source files.
  Use when the user asks to "generate a PDF", "create a Word doc", "convert markdown to PDF",
  "make a DOCX", "export this as PDF", "render this document", or any request to produce
  formatted PDF or Word output from a markdown file.
license: MIT
allowed-tools: Bash, PowerShell
---

# Document Generator — Markdown → PDF & DOCX

Convert markdown files into styled PDF and Word documents with hyperlinks, tables, and page breaks.

## Environment Setup (do NOT pip install into the user's global Python)

This skill has Python dependencies (`markdown`, `python-docx`, `playwright`). **Never install
them into the active/system interpreter** — that can break the user's environment. Instead use a
dedicated, reusable virtual environment that this skill owns, and only install what's missing.

Bootstrap once, then reuse on every run. The venv lives beside this skill at `.venv/`.

**PowerShell (Windows):**
```powershell
$skill = if ($PSScriptRoot) { $PSScriptRoot } else { $PWD.Path }  # this skill's dir (falls back to cwd)
$venv  = Join-Path $skill '.venv'
$py    = Join-Path $venv 'Scripts\python.exe'
if (-not (Test-Path $py)) { python -m venv $venv }
& $py -c "import markdown, docx, playwright" 2>$null
if ($LASTEXITCODE -ne 0) {
    & $py -m pip install --quiet --upgrade pip markdown python-docx playwright
    & $py -m playwright install msedge        # reuses an existing Edge channel if present
}
# Run the generator with the venv interpreter:
& $py your_generate_script.py
```

**Bash (macOS/Linux):**
```bash
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"; [ -n "$SKILL" ] || SKILL="$PWD"; VENV="$SKILL/.venv"; PY="$VENV/bin/python"
[ -x "$PY" ] || python3 -m venv "$VENV"
"$PY" -c "import markdown, docx, playwright" 2>/dev/null \
  || { "$PY" -m pip install --quiet --upgrade pip markdown python-docx playwright; "$PY" -m playwright install chromium; }
"$PY" your_generate_script.py
```

Notes:
- Prefer `uv` if available (`uv venv .venv && uv pip install ...`) — it's faster — but the stdlib
  `venv` path above works everywhere with no extra tooling.
- If the user already has these packages importable and prefers their own environment, ask before
  creating a venv. Default to isolation.
- Add `.venv/` to `.gitignore` if generating inside a repo.

## How It Works

- **PDF**: Markdown → HTML → PDF via Playwright + Edge headless (WeasyPrint doesn't work on Windows)
- **DOCX**: Markdown parsed line-by-line → python-docx elements with OxmlElement hyperlinks

Read `generate_template.py` in this skill's directory for the reusable code patterns: `generate_pdf()`, `add_hyperlink()`, `add_rich_text()`, `add_horizontal_rule()`, and the Azure-themed CSS.

## Workflow

1. **Set up the venv** — see *Environment Setup* above; create/reuse `.venv` beside this skill
2. **Determine config** — font (default: Aptos), table style, page size (A4), headings that should NOT page-break
3. **Generate a script** alongside the source markdown that imports from or adapts the template patterns
4. **Run it with the venv interpreter** (`.venv/Scripts/python.exe` or `.venv/bin/python`) — produces PDF and/or DOCX alongside the source file

## Gotchas

1. Python `markdown` library needs blank lines before lists
2. **Hyperlink font/size must be set explicitly** on OxmlElement runs — they don't inherit from paragraph style
3. DOCX table styles not in the default template must come from an existing DOCX opened as template
4. Don't add spacers before headings that page-break (creates empty pages)

## Custom Table Styles

To use a style like "List Table 7 Colorful Accent 1", open an existing DOCX that has it applied, strip body content (keep `w:sectPr`), then add your content — the styles carry over.
