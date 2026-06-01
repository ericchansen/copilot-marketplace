---
name: revealjs-presentation
description: |
  Generate Reveal.js HTML presentations from a topic outline or existing content.
  Use when the user asks to "create a presentation", "make slides", "build a deck",
  "generate a slideshow", "create a slide deck", "turn this into slides",
  "make a Reveal.js presentation", "create slides about", "add slides",
  "update my presentation", "fix my slides", or any request to produce
  an HTML slide presentation.
license: MIT
allowed-tools: Bash, PowerShell
---

# Reveal.js Presentation Generator

Generate professional Reveal.js presentations from topic outlines, existing content, or iterative editing requests.

## Prerequisites

For npm-based projects (Vite + Reveal.js):

```bash
npm install reveal.js
```

For standalone single-file output: **no prerequisites** — the template uses CDN links.

## How It Works

The skill generates `---`-separated Markdown that Reveal.js's built-in Markdown plugin renders at runtime in the browser. The HTML shell is a static template that loads Reveal.js and points to the generated markdown. This separation means the LLM writes only Markdown — never raw HTML `<section>` blocks.

Read `reveal-template.html` in this skill's directory for the reusable CDN-based HTML shell.

## Workflow

### Step 1: Gather Requirements

Determine (or infer from context):

| Parameter | Default | Options |
|-----------|---------|---------|
| **Topic** | *(required)* | What the presentation is about |
| **Audience** | general | developers, executives, students, general |
| **Slide count** | 8–12 | Any reasonable number |
| **Tone** | professional | professional, casual, academic, inspiring, humorous |
| **Type** | general | technical, business, educational, creative, general |
| **Include code?** | no | Determines code highlighting emphasis |
| **Theme** | dracula | black, white, league, beige, night, serif, simple, solarized, moon, dracula, sky, blood |

### Step 2: Generate Slide Markdown

Produce `---`-separated Markdown following these rules.

#### Slide Format

```markdown
<!-- .slide: data-background-gradient="linear-gradient(to bottom, #283b95, #17b2c3)" -->
# Presentation Title
## Subtitle

Note:
Opening hook — surprising statistic, provocative question, or story.
Timing: ~1 minute

---
## Agenda

- Topic 1 <!-- .element: class="fragment" -->
- Topic 2 <!-- .element: class="fragment" -->
- Topic 3 <!-- .element: class="fragment" -->

Note:
Big promise — what the audience will learn.
Timing: ~1 minute

---
## Content Slide

- Point 1 <!-- .element: class="fragment" -->
- Point 2 <!-- .element: class="fragment" -->
- Point 3 <!-- .element: class="fragment" -->

Note:
Story or example → Analogy → Transition phrase.
Timing: ~2 minutes

---
## Conclusion

1. Key takeaway 1 <!-- .element: class="fragment" -->
2. Key takeaway 2 <!-- .element: class="fragment" -->
3. Key takeaway 3 <!-- .element: class="fragment" -->

Note:
We started with X, learned Y, now you can Z.
Timing: ~1 minute
```

#### Content Rules (Non-Negotiable)

1. **Maximum 4 bullet points per slide** — working memory can only hold ~4 items
2. **ONE main idea per slide** — cognitive load principle
3. **Title slide has NO bullets** — visual impact only
4. **Every slide MUST have a `Note:` block** — speaker notes with timing
5. **Use `<!-- .element: class="fragment" -->` on bullets** — staged reveals
6. **Vary backgrounds** across slides — gradients, solid colors, images with opacity
7. **Code blocks use step-through line highlighting**: ` ```python [1-2|3|4] `

#### Reveal.js Features to Use

**Auto-animate** (consecutive related slides):
```markdown
<!-- .slide: data-auto-animate -->
## Step 1: Setup

<!-- .slide: data-auto-animate -->
## Step 2: Build
```

**Background variety**:
```markdown
<!-- .slide: data-background-color="#1a1a2e" -->
<!-- .slide: data-background-gradient="linear-gradient(to bottom, #283b95, #17b2c3)" -->
<!-- .slide: data-background-image="https://images.unsplash.com/..." data-background-opacity="0.3" -->
```

**Impact statements**:
```html
<h2 class="r-fit-text">BIG STATEMENT</h2>
```

**Fragment animation types** (use beyond just `fragment`):
`fade-up`, `fade-out`, `grow`, `shrink`, `highlight-red`, `highlight-blue`, `strike`, `current-visible`

**Code with step-through highlighting**:
````markdown
```python [1-2|3|4]
import pandas as pd
df = pd.read_csv('data.csv')
result = df.groupby('category').sum()
print(result)
```
````

The `[1-2|3|4]` syntax highlights lines 1-2 first, then 3, then 4 on successive clicks.

#### Tone Guidelines

| Tone | Vocabulary | Colors |
|------|-----------|--------|
| **professional** | Authoritative, data-driven | Blues, grays, whites |
| **casual** | Conversational, relatable examples | Warm tones |
| **academic** | Scholarly, citations, evidence | Navy, maroon, cream |
| **inspiring** | Motivational, aspirational | Vibrant, high-contrast |
| **humorous** | Witty observations, playful | Unexpected combos |

#### Topic Type Guidelines

| Type | Emphasis |
|------|----------|
| **technical** | Code examples, architecture diagrams, before/after auto-animate |
| **business** | ROI/metrics, case studies, executive summary approach |
| **educational** | Learning objectives, scaffolded info, comprehension checks |
| **creative** | Visual-first, unexpected layouts, emotional connection |

### Step 3: Keep Content Fitting on Slides

Overflow is the #1 visual problem. Follow these constraints:

**Text limits per slide:**
- **Bullets**: max 4, each ≤ 12 words
- **Headings**: ≤ 8 words
- **Code blocks**: max 10–12 lines visible at once (use step-through highlighting for longer code)
- **Paragraphs**: avoid entirely — convert to bullets or speaker notes

**When content overflows, use these escape valves (in order):**

1. **Split into multiple slides** — the cheapest fix; add another `---` and spread content across two slides
2. **Move detail to speaker notes** — the audience sees the headline, the speaker gets the detail in `Note:`
3. **Use vertical slides** — `--` separator creates a drill-down slide below the current one
4. **Use `r-fit-text`** — auto-sizes text to fill the slide width (good for single statements):
   ```html
   <h2 class="r-fit-text">This scales to fit</h2>
   ```
5. **Use `r-stretch`** — makes an image/element fill remaining vertical space:
   ```html
   <img class="r-stretch" src="diagram.png" />
   ```
6. **Reduce font via CSS variables** — last resort:
   ```css
   :root { --r-main-font-size: 36px; }  /* default is 40px */
   ```

**Code overflow specifically:**
- Prefer showing 6–8 key lines with `[1-3|4-6|7-8]` step-through, not the whole file
- Use `data-line-numbers` without highlights to show line numbers for context
- If the full code matters, link to a repo or put it in speaker notes

**Never** rely on Reveal.js's auto-scaling to shrink overflowing content — it produces unreadable tiny text. If the content doesn't fit at default size, restructure it.

### Step 4: Assemble the Presentation

**For a new Vite + Reveal.js project** (scaffold from scratch):

```bash
mkdir my-presentation && cd my-presentation
npm init -y
npm install reveal.js
npm install -D vite
```

Create `vite.config.js`:
```javascript
import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 8000, open: true } });
```

Create `index.html` using the boilerplate from `reveal-template.html` in this skill's directory, but replace CDN links with npm imports in a `src/main.js`:
```javascript
import Reveal from 'reveal.js';
import Markdown from 'reveal.js/plugin/markdown';
import Highlight from 'reveal.js/plugin/highlight';
import Notes from 'reveal.js/plugin/notes';
import 'reveal.js/dist/reveal.css';
import 'reveal.js/dist/theme/dracula.css';
import 'reveal.js/plugin/highlight/monokai.css';

const deck = new Reveal({
  hash: true,
  navigationMode: 'linear',
  transition: 'slide',
  slideNumber: 'c/t',
  autoAnimate: true,
  pdfSeparateFragments: false,
  defaultTiming: 120,
  plugins: [Markdown, Highlight, Notes],
});
deck.initialize();
```

Write slide markdown to `public/slides/content.md`, reference it in `index.html`:
```html
<section data-markdown="slides/content.md"
  data-separator="^\r?\n---\r?\n$"
  data-separator-vertical="^\r?\n--\r?\n$"
  data-separator-notes="^Note:">
</section>
```

Run with `npx vite` — hot reload updates slides on save.

**For an existing Vite + Reveal.js project:**
1. Write markdown to `public/slides/` as `.md` files (one file per chapter or a single `content.md`)
2. Ensure `index.html` has `<section data-markdown="slides/content.md" ...>` pointing at the file(s)
3. Run `npm run dev` for live preview with hot reload

**For a standalone single-file presentation:**
1. Read `reveal-template.html` in this skill's directory
2. Replace `{{TITLE}}` with the presentation title
3. Replace `{{THEME}}` with the chosen theme name
4. Replace `{{SLIDES_MARKDOWN}}` with the generated markdown content
5. Output is a single `.html` file — works anywhere with an internet connection (CDN)

### Step 5: Validate

Before delivering, run these checks on the generated markdown:

1. **Separator count** — number of `---` lines should equal slide count minus 1 (e.g., 8 slides = 7 separators)
2. **No bare `---` inside code fences** — will break slide parsing
3. **Every slide has content** — no empty sections between separators
4. **Speaker notes present** — every slide should have a `Note:` block
5. **Fragment syntax correct** — `<!-- .element: class="fragment" -->` (exact format)
6. **Code fences closed** — every ` ``` ` open has a matching close

If validation fails, fix the problematic slides before delivering.

### Step 6: Iterate

Common follow-up requests and how to handle them:

| Request | Action |
|---------|--------|
| Change theme | Swap CSS link: `dist/theme/{name}.css` or override `--r-*` variables |
| Add/remove slides | Edit markdown, maintain `---` separators |
| Adjust tone | Regenerate affected slides with different tone guidance |
| Export to PDF | Append `?print-pdf` to URL → Chrome Print → Save as PDF (Landscape, no margins, background graphics ✓) |
| Different layout | Use `r-fit-text`, `r-stack`, `r-stretch` classes; vertical slides with `--` separator |

## Theme Quick Reference

| Theme | Best For | Look |
|-------|----------|------|
| `dracula` | Developer audiences | Dark purple, modern |
| `black` | Any audience (default) | Pure black, high contrast |
| `white` | Bright rooms, printing | Clean white |
| `moon` | Evening events | Dark blue, elegant |
| `solarized` | Long presentations | Warm cream, easy on eyes |
| `night` | Technical talks | Dark navy |
| `serif` | Academic/formal | Light with serif fonts |
| `blood` | Bold statements | Dark red accents |

## CSS Custom Property Overrides

All themes expose `--r-*` variables for quick branding without a build step:

```css
:root {
  --r-background-color: #1a1a2e;
  --r-main-font: 'Inter', sans-serif;
  --r-main-color: #e8e8f0;
  --r-heading-color: #ffffff;
  --r-heading-font: 'Inter', sans-serif;
  --r-link-color: #7c6af7;
  --r-code-font: 'JetBrains Mono', monospace;
}
```

## Gotchas

1. **External markdown requires a web server** — `file://` won't work; use `npx vite`, `python -m http.server`, or `npx serve`
2. **Windows line endings** — the default separator regex `^\n---\n$` won't match `\r\n`; use `data-separator="^\r?\n---\r?\n$"` in the template
3. **Code fences containing `---`** are interpreted as slide separators — ensure fences are properly closed
4. **`animateLists: true` option** auto-wraps every `<li>` with `class="fragment"` — use this OR manual `<!-- .element: -->` comments, not both
5. **PDF export fragments** — default creates one PDF page per fragment step; set `pdfSeparateFragments: false` for handout-style output
6. **Don't generate raw `<section>` HTML** — LLMs hallucinate HTML entities (`&lt;` instead of `<`) and forget closing tags; always produce Markdown

## Critical Rules

1. **Never generate raw HTML `<section>` blocks** — always produce `---`-separated Markdown that Reveal.js's Markdown plugin parses at runtime
2. **Always include `Note:` speaker notes** on every slide — presentations without notes are incomplete
3. **Always validate `---` separator count** against expected slide count before delivering
4. **Respect existing project structure** — if working inside a Vite + Reveal.js repo, write markdown files to the correct location; don't overwrite `index.html` unless asked
5. **Slide count must be explicit** — if the user doesn't specify, default to 8–12 and state the count chosen
