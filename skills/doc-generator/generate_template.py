"""
Document Generator — Core patterns for Markdown → PDF & DOCX conversion.

PDF: Markdown → HTML (via markdown lib) → PDF via Playwright + Edge headless
DOCX: Markdown parsed line-by-line → python-docx elements

Prerequisites: pip install markdown python-docx playwright && playwright install msedge
"""

import re
from pathlib import Path
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


# --- PDF Generation (Playwright + Edge) ---

PDF_CSS = """
@page { size: A4; margin: 2cm; }
body { font-family: 'Segoe UI', Aptos, Arial, sans-serif; font-size: 11pt; line-height: 1.5; }
h1 { font-size: 20pt; color: #0078d4; border-bottom: 2px solid #0078d4; }
h2 { font-size: 15pt; color: #333; border-bottom: 1px solid #ddd;
     page-break-before: always; page-break-after: avoid; }
h2:first-of-type { page-break-before: avoid; }
h3 { font-size: 13pt; color: #0078d4; page-break-before: always; page-break-after: avoid; }
h3:first-of-type { page-break-before: avoid; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; page-break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: 5px 8px; }
th { background: #f0f4f8; font-weight: 600; }
tr:nth-child(even) { background: #fafbfc; }
p { page-break-after: avoid; }
a { color: #0078d4; text-decoration: none; }
blockquote { border-left: 3px solid #0078d4; background: #f0f7ff; page-break-inside: avoid; }
ul, ol { page-break-inside: avoid; }
"""


def generate_pdf(md_path: str, output_path: str, css: str = PDF_CSS):
    """Generate PDF from markdown using Playwright + Edge."""
    import markdown
    from playwright.sync_api import sync_playwright

    md_text = open(md_path, 'r', encoding='utf-8').read()
    html_body = markdown.markdown(md_text, extensions=['tables'])

    # Keep table titles with tables
    html_body = re.sub(
        r'(<p><strong>[^<]+</strong></p>\s*<table\b[^>]*>.*?</table>)',
        r'<div style="page-break-inside: avoid;">\1</div>',
        html_body, flags=re.DOTALL)

    html_path = Path(md_path).with_suffix('.tmp.html')
    html_path.write_text(
        f'<!DOCTYPE html><html><head><meta charset="utf-8"><style>{css}</style></head>'
        f'<body>{html_body}</body></html>', encoding='utf-8')

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='msedge', headless=True)
            page = browser.new_page()
            page.goto(html_path.resolve().as_uri())
            page.pdf(path=output_path, format='A4',
                     margin={'top': '2cm', 'bottom': '2cm', 'left': '2cm', 'right': '2cm'},
                     print_background=True)
            browser.close()
    finally:
        html_path.unlink(missing_ok=True)


# --- DOCX Hyperlinks (python-docx doesn't support natively) ---

def add_hyperlink(paragraph, text, url, font_name='Aptos', font_size_pt=12):
    """Add a clickable hyperlink to a python-docx paragraph."""
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


def add_rich_text(paragraph, text, font_size=None):
    """Parse markdown text into runs, creating hyperlinks for [text](url) patterns."""
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


def add_horizontal_rule(doc):
    """Add a horizontal rule paragraph to a python-docx document."""
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
