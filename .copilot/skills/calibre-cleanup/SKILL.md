---
name: calibre-cleanup
description: 'Clean up Calibre library metadata using AI reading and reasoning — not regex. Reads each book description and author name, uses judgment to fix formatting (dashes, spacing, HTML), remove promotional text, standardize author names, and improve overall quality. Use when user says "clean up Calibre", "fix book descriptions", "clean up my library", "fix Calibre metadata", or any variant of Calibre library maintenance.'
license: MIT
allowed-tools: Bash, PowerShell
---

# Calibre Library Metadata Cleanup

Clean up book descriptions and author names in a Calibre library using **your own reading comprehension and judgment** — not regex or pattern-matching code.

## Core Principle

**Read each description. Understand it. Fix it.**

You are an editor, not a find-and-replace engine. Every change must be informed by understanding the text in context. For example:

- `---` between words in a sentence is an em-dash → replace with `—`
- `---` alone on a line is a visual separator → remove or replace with `<hr>`
- `----------` is decorative noise → remove entirely
- `1993-1996` is a date range → leave it alone
- `self-aware` is a compound word → leave it alone
- `"A NEW YORK TIMES BESTSELLER"` at the top of a description is promotional → remove it
- `"...became a bestseller upon publication"` in a description sentence is content → keep it

A regex cannot make these distinctions. You can.

> You may use queries or simple scripts to extract and display records, but do **not** use regex or bulk replacement to decide or perform text edits. Every proposed edit must be based on reading the specific description in context.

> Do **not** enrich, summarize from memory, or add facts from outside knowledge. Only fix what's already there. If a description is empty, leave it empty — do not write one from scratch unless the user explicitly asks.

## Step 1: Locate the Library

Find the Calibre library path:

```powershell
# Check home-server repo .env
Get-Content "$env:USERPROFILE\repos\home-server\calibre-web\.env" | Select-String "CALIBRE_LIBRARY_PATH"
```

If not found, ask the user for the path. Verify `metadata.db` exists at that path.

## Step 2: Stop Calibre-Web

If a Calibre-Web container (CWA) is running, stop it **before** backing up or touching the DB:

```powershell
# Check if CWA is running
docker ps --filter "name=calibre" --format "{{.Names}}"

# Stop it via home-server compose
Set-Location "$env:USERPROFILE\repos\home-server"
docker compose -p home stop calibre-web-automated
```

## Step 3: Back Up the Database

**Always back up after stopping CWA to ensure a consistent snapshot.**

```powershell
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item "$libraryPath\metadata.db" "$libraryPath\metadata.db.bak.$timestamp"
```

## Step 4: Validate Schema

Before reading or writing, inspect the actual schema to confirm expected tables and columns:

```sql
.schema books
.schema comments
.schema authors
.schema books_authors_link
```

Verify that `comments` has `book` and `text`, `authors` has `id`, `name`, `sort`, and `books_authors_link` has `book` and `author`. Also check whether `books` has an `author_sort` column — if so, author changes must update it too. Adapt queries to the discovered schema.

## Step 5: Scan and Read Descriptions

Query all descriptions from the database:

```python
import sqlite3
conn = sqlite3.connect(r"<library_path>\metadata.db")
cur = conn.cursor()

cur.execute("""
    SELECT b.id, b.title, c.text
    FROM books b
    JOIN comments c ON c.book = b.id
    ORDER BY b.sort
""")
books = cur.fetchall()
```

### Track Progress

Use the session SQL database to track which books have been reviewed:

```sql
CREATE TABLE IF NOT EXISTS cleanup_progress (
    book_id INTEGER PRIMARY KEY,
    title TEXT,
    status TEXT DEFAULT 'pending',  -- pending, needs_change, approved, applied, skipped
    category TEXT,                   -- formatting, promo, rewrite, author
    notes TEXT
);
```

Insert all books as `pending` at the start. Update status as you work through them.

### Read and Evaluate — Adaptive Batching

Process books in batches, adapting size to complexity:

- **20 books** if descriptions are short and simple
- **5–10 books** if descriptions are long or messy
- **1–3 books** for severely broken descriptions needing major rewrites

For each description, **read the full text** and look for:

#### Formatting Issues
- **ASCII dashes used as em-dashes**: `--` or `---` between words/phrases. Read the sentence — if it's a parenthetical aside or attribution, it's an em-dash (`—`). If it's a date range or compound word, leave it.
- **Double spaces**: Collapse to single spaces (except in preformatted blocks).
- **Excessive whitespace**: Leading/trailing whitespace in paragraphs.
- **`&nbsp;`**: Replace with regular spaces unless used for intentional formatting.
- **Broken HTML**: Unclosed tags, stray `<br>` at start/end, empty paragraphs.
- **Markdown artifacts**: Stray `*`, `**`, `_` from bad conversions. Read the context — if it looks like failed bold/italic conversion, fix it; if it's intentional, leave it.

#### Promotional/Non-Description Content
- **Bestseller banners**: "A NEW YORK TIMES BESTSELLER", "THE MILLION COPY INTERNATIONAL BESTSELLER", etc. These are promotional — remove them. But: if the sentence is part of the actual description ("...which went on to become a bestseller"), keep it.
- **Award banners**: "WINNER OF THE PULITZER PRIZE" as a standalone line is promotional. "...awarded the Pulitzer Prize in 2019" in a sentence is content.
- **Amazon/publisher headers**: "Amazon.com Review", "From Publishers Weekly", "From the Back Cover". Remove the header label but **keep the content that follows** — it's often the only description.
- **"About the Author" sections**: Remove unless the book has no other description.
- **Review quote walls**: Short blurbs like `"Masterful!" —The Guardian` are fine. Walls of stacked review quotes with no actual description should be trimmed to 1-2 best ones plus the real description.

#### Structural Issues
- **`<hr>` tags**: Remove — they're visual noise in metadata.
- **Separator lines**: Lines of dashes, equals signs, or asterisks used as dividers. Remove.
- **Duplicated content**: Same paragraph appearing twice. Remove the duplicate.
- **Excessively long descriptions**: >2KB likely has interview transcripts, full reviews, or bulk content that doesn't belong. Trim to the core description.

#### Severely Broken Descriptions
Some descriptions may be damaged beyond simple fixes. For these:
1. Identify the core description content
2. Rewrite cleanly in simple HTML
3. Preserve the original meaning and tone — do NOT editorialize

#### HTML Output Format
When writing or rewriting descriptions, use conservative HTML:
- `<p>...</p>` for paragraphs
- `<em>`, `<i>`, `<strong>`, `<b>` for emphasis
- `<br>` for line breaks within a paragraph (sparingly)
- Do **not** introduce CSS, `<span>`, `<font>`, `<div>`, or external links unless already present and meaningful
- Do **not** use Markdown — Calibre stores descriptions as HTML

## Step 6: Read and Evaluate Author Names

Query all authors:

```python
cur.execute("SELECT id, name, sort FROM authors ORDER BY sort")
```

**Author cleanup is riskier than descriptions.** Handle as a separate, more cautious phase.

Look for:
- **Punctuation artifacts**: Pipes (`|`), semicolons (`;`), or other stray characters
- **Honorifics/titles**: "Graf", "Earl of" — generally remove for library sorting, but use judgment (e.g., "Sir Arthur Conan Doyle" is commonly known with "Sir")
- **Spelling variants**: Same author with different spellings (e.g., Tolstoi/Tolstoy) — flag for merge
- **Sort key issues**: `sort` should be "Last, First" format
- **Encoding issues**: Garbled Unicode, missing accents, mojibake

**Denormalized fields**: If `books` has an `author_sort` column, author renames/merges must also update `books.author_sort` for affected books. Query `books_authors_link` to find which books are affected.

## Step 7: Present Changes for Review

**CRITICAL: Never apply changes without user approval.**

### Approval Categories

Split changes by risk level to avoid review fatigue:

**Safe formatting** (summarize with representative examples):
> 12 books: fixed em-dashes (e.g., `word---word` → `word—word` in "The Great Gatsby")
> 8 books: removed `&nbsp;` entities
> 3 books: collapsed double spaces

**Content removal** (show exact removed text):
> "Book Title" (ID: 123): Removed standalone promo line: "A NEW YORK TIMES BESTSELLER"

**Major rewrites** (full before/after required):
> "Broken Book" (ID: 789):
> Before: [show the garbled text]
> After: [show the clean rewrite]

**Author changes** (explicit approval required for each):
> "Jones|" → "Jones" — removed trailing pipe
> "Leo Tolstoi" → merge into "Leo Tolstoy" — spelling variant (affects 3 books)

## Step 8: Apply Approved Changes

Wrap each approved batch in an explicit transaction:

```python
try:
    conn.execute("BEGIN")

    # Descriptions
    for book_id, new_text in description_changes:
        cur.execute("UPDATE comments SET text = ? WHERE book = ?", (new_text, book_id))

    # Author names
    for author_id, new_name, new_sort in author_renames:
        cur.execute("UPDATE authors SET name = ?, sort = ? WHERE id = ?",
                    (new_name, new_sort, author_id))

    # Author merges (handle unique constraint)
    for old_id, new_id in author_merges:
        # Delete links that would violate unique(book, author)
        cur.execute("""
            DELETE FROM books_authors_link
            WHERE author = ? AND book IN (
                SELECT book FROM books_authors_link WHERE author = ?
            )
        """, (old_id, new_id))
        # Move remaining links
        cur.execute("UPDATE books_authors_link SET author = ? WHERE author = ?",
                    (new_id, old_id))
        # Delete old author
        cur.execute("DELETE FROM authors WHERE id = ?", (old_id,))

    # Update books.author_sort if applicable
    # (query affected books and recalculate)

    conn.commit()
except Exception as e:
    conn.rollback()
    # Report error — do not continue
    raise
```

### Post-Apply Verification

After committing, verify:

1. **Row counts**: Number of changed rows matches number of approved changes
2. **Re-query every changed book**: Read back each updated description/author and confirm it looks correct
3. **No empty descriptions**: `SELECT book FROM comments WHERE text IS NULL OR text = ''`
4. **No orphaned links**: `SELECT * FROM books_authors_link WHERE author NOT IN (SELECT id FROM authors)`

Update the progress tracking table:

```sql
UPDATE cleanup_progress SET status = 'applied' WHERE book_id IN (...);
```

## Step 9: Restart Calibre-Web and Verify

```powershell
Set-Location "$env:USERPROFILE\repos\home-server"
docker compose -p home start calibre-web-automated
```

After restart, verify CWA comes up healthy. Spot-check a few books in the web UI if possible.

## Important Rules

1. **Read, don't regex.** Every change comes from understanding the text. No bulk pattern replacement for content decisions.
2. **Preserve meaning.** Never alter what a description says — only how it's formatted.
3. **Do not invent.** Never add plot details, awards, or facts not present in the original text.
4. **When in doubt, leave it.** If you're not sure whether something is promotional or content, keep it.
5. **Show your work.** The user must see and approve every change before it's applied.
6. **Batch adaptively.** Short descriptions: ~20 per batch. Long/messy: 5-10. Major rewrites: 1-3.
7. **Be idempotent.** After cleanup, running the skill again should find nothing to fix.
8. **Back up first.** Always. After stopping CWA. No exceptions.
9. **Transact safely.** Wrap applies in transactions. Rollback on error. Verify after commit.
10. **Authors are separate.** Handle author cleanup as a distinct, cautious phase after descriptions.
