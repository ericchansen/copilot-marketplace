---
name: doc-generator
description: |
  Generate professional PDF and Word (DOCX) documents from markdown source files.
  Use when the user asks to "generate a PDF", "create a Word doc", "convert markdown to PDF",
  "make a DOCX", "export this as PDF", "render this document", or any request to produce
  formatted PDF or Word output from a markdown file. Handles tables, hyperlinks, page breaks,
  horizontal rules, and Azure-themed styling. Supports custom fonts, table styles, and
  per-section page break control.
license: MIT
allowed-tools: Bash, PowerShell
---

# Document Generator — Markdown → PDF & DOCX

Convert markdown files into professionally styled PDF and Word documents with clickable
hyperlinks, formatted tables, smart page breaks, and Azure-themed styling.

## Prerequisites

```powershell
pip install markdown python-docx playwright
playwright install msedge
```

## How It Works

1. **PDF**: Markdown → HTML (via `markdown` library with `tables` extension) → rendered to PDF via Playwright + Edge headless
2. **DOCX**: Markdown parsed line-by-line → python-docx elements with proper styling, hyperlinks, and page breaks

WeasyPrint does NOT work on Windows (requires GTK/Pango). Playwright + Edge is the reliable path.

## Usage

When the user provides a markdown file and asks for PDF/DOCX output, generate a `generate.py`
script alongside the markdown file using the patterns below, then run it.

### Step 1: Determine Configuration

Ask the user (or use defaults) for:

| Setting | Default | Options |
|---------|---------|---------|
| **Font** | Aptos | Any system font (Aptos, Calibri, Segoe UI, etc.) |
| **Table style** | List Table 7 Colorful Accent 1 | Any Word built-in style (see discovery below) |
| **Body font size** | 12pt (DOCX), 11pt (PDF) | Any |
| **Table font size** | 10pt | Any |
| **Page size** | A4 | A4, Letter |
| **No-break headings** | None | List of h2 headings that should NOT page-break |

### Step 2: Discover Available Table Styles

If the user wants a custom table style, list available styles:

```python
from docx import Document
doc = Document()
for s in doc.styles:
    if s.type is not None and s.type.name == 'TABLE':
        print(s.name)
```

For styles not in the default template (like "List Table 7 Colorful Accent 1"), the user must
first create a DOCX with that style applied, then use it as a template.

### Step 3: Generate the Script

Create a `generate.py` alongside the source markdown. The script should:

1. Read the markdown source
2. Generate PDF via Playwright + Edge
3. Generate DOCX via python-docx
4. Save outputs alongside the source file

## Core Patterns

### PDF Generation (Playwright + Edge)

```python
from pathlib import Path
import markdown
from playwright.sync_api import sync_playwright

md_text = open('source.md', 'r', encoding='utf-8').read()
html_body = markdown.markdown(md_text, extensions=['tables'])

css = """
@page { size: A4; margin: 2cm; }
body { font-family: 'Segoe UI', Aptos, Arial, sans-serif; font-size: 11pt; line-height: 1.5; }
h1 { font-size: 20pt; color: #0078d4; border-bottom: 2px solid #0078d4; }
h2 { font-size: 15pt; color: #333; border-bottom: 1px solid #ddd;
     page-break-before: always; page-break-after: avoid; }
h2:first-of-type { page-break-before: avoid; }
h3 { font-size: 13pt; color: #0078d4;
     page-break-before: always; page-break-after: avoid; }
h3:first-of-type { page-break-before: avoid; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt;
        page-break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: 5px 8px; }
th { background: #f0f4f8; font-weight: 600; }
tr:nth-child(even) { background: #fafbfc; }
td:nth-child(2), th:nth-child(2) { white-space: nowrap; }
p { page-break-after: avoid; }
a { color: #0078d4; text-decoration: none; }
blockquote { border-left: 3px solid #0078d4; background: #f0f7ff;
             page-break-inside: avoid; }
ul, ol { page-break-inside: avoid; }
"""

# To skip page-break on specific h2s:
# html_body = html_body.replace('<h2>Section Name</h2>', '<h2 class="no-break">Section Name</h2>')
# Add CSS: h2.no-break { page-break-before: avoid; }

html_path = '_temp.html'
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(f'<!DOCTYPE html><html><head><meta charset="utf-8"><style>{css}</style></head>'
            f'<body>{html_body}</body></html>')

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page()
    page.goto(Path(html_path).resolve().as_uri())
    page.pdf(path='output.pdf', format='A4',
             margin={'top': '2cm', 'bottom': '2cm', 'left': '2cm', 'right': '2cm'},
             print_background=True)
    browser.close()
Path(html_path).unlink()
```

### Keep Table Titles With Tables (PDF)

Wrap bold paragraphs + following tables in a no-break div:

```python
import re
html_body = re.sub(
    r'(<p><strong>[^<]+</strong></p>\s*<table\b[^>]*>.*?</table>)',
    r'<div style="page-break-inside: avoid;">\1</div>',
    html_body,
    flags=re.DOTALL)
```

### DOCX Hyperlinks

python-docx doesn't natively support hyperlinks. Use OxmlElement:

```python
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

def add_hyperlink(paragraph, text, url, font_name='Aptos', font_size_pt=12):
    part = paragraph.part
    r_id = part.relate_to(url,
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
        is_external=True)
    hyperlink = OxmlElement('w:hyperlink')
    hyperlink.set(qn('r:id'), r_id)
    run = OxmlElement('w:r')
    rPr = OxmlElement('w:rPr')
    rFonts = OxmlElement('w:rFonts')
    rFonts.set(qn('w:ascii'), font_name)
    rFonts.set(qn('w:hAnsi'), font_name)
    rPr.append(rFonts)
    half_pts = str(int(font_size_pt * 2))
    for tag in ['w:sz', 'w:szCs']:
        el = OxmlElement(tag)
        el.set(qn('w:val'), half_pts)
        rPr.append(el)
    color = OxmlElement('w:color')
    color.set(qn('w:val'), '0078D4')
    rPr.append(color)
    u = OxmlElement('w:u')
    u.set(qn('w:val'), 'single')
    rPr.append(u)
    run.append(rPr)
    run_text = OxmlElement('w:t')
    run_text.text = text
    run.append(run_text)
    hyperlink.append(run)
    paragraph._element.append(hyperlink)
```

**Critical:** Always set font name AND size explicitly on hyperlink runs — they don't inherit
from the paragraph style and will render in a different font/size otherwise.

### DOCX Rich Text (Markdown → Runs with Links)

Parse markdown text into runs, creating hyperlinks where `[text](url)` patterns appear:

```python
def add_rich_text(paragraph, text, font_size=None):
    parts = re.split(r'(\[[^\]]+\]\([^\)]+\))', text)
    for part in parts:
        link_match = re.match(r'\[([^\]]+)\]\(([^\)]+)\)', part)
        if link_match:
            add_hyperlink(paragraph, link_match.group(1), link_match.group(2),
                         font_size_pt=font_size.pt if font_size else 12)
        else:
            plain = re.sub(r'\*\*(.+?)\*\*', r'\1', part)
            plain = re.sub(r'`([^`]+)`', r'\1', plain)
            if plain:
                run = paragraph.add_run(plain)
                if font_size:
                    run.font.size = font_size
```

### DOCX Horizontal Rules

```python
p = doc.add_paragraph()
pPr = p._element.get_or_add_pPr()
pBdr = OxmlElement('w:pBdr')
bottom = OxmlElement('w:bottom')
bottom.set(qn('w:val'), 'single')
bottom.set(qn('w:sz'), '6')
bottom.set(qn('w:space'), '1')
bottom.set(qn('w:color'), 'CCCCCC')
pBdr.append(bottom)
pPr.append(pBdr)
```

### DOCX Template Inheritance (Custom Table Styles)

```python
from docx import Document
from docx.oxml.ns import qn

doc = Document('existing.docx')  # has the table style we want
body = doc.element.body
for element in list(body):
    if element.tag != qn('w:sectPr'):
        body.remove(element)
# Now add content — table styles are available
```

### DOCX Table Spacing

Add spacer after tables only when NOT followed by a heading:

```python
next_line = ''
for ni in range(i, len(lines)):
    if lines[ni].strip():
        next_line = lines[ni].strip()
        break
if not next_line.startswith('#'):
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(6)
```

## Gotchas

1. **WeasyPrint doesn't work on Windows** — use Playwright + Edge instead
2. **Python `markdown` library needs blank lines before lists** — `- item` right after a paragraph won't render
3. **Hyperlink font/size must be explicit** — OxmlElement hyperlinks don't inherit styles
4. **DOCX table styles not in default template** — must open an existing file that has the style
5. **Page break + spacer = empty page** — don't add spacers before headings that page-break
6. **`h2.no-break` class** — use HTML string replacement to mark specific headings, not CSS-only

## Working Example

Use the code snippets and guidance in this skill as the reference implementation for adapting
the document generator to your repository and markdown input.

## References

- [python-docx docs](https://python-docx.readthedocs.io/)
- [Playwright PDF API](https://playwright.dev/python/docs/api/class-page#page-pdf)
- [Python markdown extensions](https://python-markdown.github.io/extensions/)
