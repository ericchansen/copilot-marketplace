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

## Prerequisites

```
pip install markdown python-docx playwright && playwright install msedge
```

## How It Works

- **PDF**: Markdown → HTML → PDF via Playwright + Edge headless (WeasyPrint doesn't work on Windows)
- **DOCX**: Markdown parsed line-by-line → python-docx elements with OxmlElement hyperlinks

Read `generate_template.py` in this skill's directory for the reusable code patterns: `generate_pdf()`, `add_hyperlink()`, `add_rich_text()`, `add_horizontal_rule()`, and the Azure-themed CSS.

## Workflow

1. **Determine config** — font (default: Aptos), table style, page size (A4), headings that should NOT page-break
2. **Generate a script** alongside the source markdown that imports from or adapts the template patterns
3. **Run it** — produces PDF and/or DOCX alongside the source file

## Gotchas

1. Python `markdown` library needs blank lines before lists
2. **Hyperlink font/size must be set explicitly** on OxmlElement runs — they don't inherit from paragraph style
3. DOCX table styles not in the default template must come from an existing DOCX opened as template
4. Don't add spacers before headings that page-break (creates empty pages)

## Custom Table Styles

To use a style like "List Table 7 Colorful Accent 1", open an existing DOCX that has it applied, strip body content (keep `w:sectPr`), then add your content — the styles carry over.
