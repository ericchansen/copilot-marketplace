# Writing principles

These are original recommendations for the **software-clarity** profile, not
a complete summary of ASD-STE100. They combine the sources below with safeguards
for source-grounded drafting and revision.

## Clarity without lost meaning

Use common, concrete language when it conveys the same meaning. Keep a precise
domain term when a simpler replacement would be less accurate. Define unfamiliar
terms for the intended reader, not every term an expert audience already knows.
Use one stable term for a concept and preserve distinctions between concepts.
See [Microsoft's terminology guidance](https://learn.microsoft.com/en-us/style-guide/word-choice/use-technical-terms-carefully)
and [STE's vocabulary model](https://www.asd-ste100.org/about_STE.html).

Prefer a direct verb and an explicit actor when the source identifies the actor.
Use passive voice when needed to preserve an unknown actor or the intended focus.
Do not replace "The configuration was deleted during the update" with "The updater
deleted the configuration" without evidence. The revision invents a cause.
See [Microsoft's voice guidance](https://learn.microsoft.com/en-us/style-guide/grammar/verbs)
and ASD-STE100 Issue 9, Rule 3.6, in the
[official standard](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf).

Prefer focused sentences and paragraphs. Keep each paragraph on one topic and
make the relationship between sentences explicit. Preserve helper words,
articles, useful repetition, and qualifications. Do not turn clear prose into
telegraphic fragments. See [Google's global-audience guidance](https://developers.google.com/style/translation).

Use sentence length as a prompt to inspect complexity, not as a license to delete
facts. Strict STE uses different limits for procedural and descriptive sentences
and has special counting rules. A whitespace counter is not an STE word counter.
Do not import a hard threshold into software-clarity or claim formal violations
from an approximate count. See Issue 9, Sections 5, 6, and 8, in the
[official standard](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf).

Explain ambiguous noun stacks with the relationships they conceal. Preserve
official product names and UI labels exactly. Introduce a shorter term only when
its meaning and relationship to the original are clear. Do not globally replace
`client`, `customer`, `caller`, and `tenant`: they may describe different entities.

## Instructions and results

Use imperative verbs for instructions. Give context or an applicable condition
first when the reader must know it before acting. Separate independent actions
and preserve their order. Keep simultaneous actions and immediate acceptance
criteria together when splitting them would change the procedure.
See [Microsoft's step guidance](https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions)
and [Google's procedures guidance](https://developers.google.com/style/procedures).

Make optional steps explicit. State how the reader knows a step or procedure
succeeded when the evidence supplies that result. Do not invent success output,
timeouts, environment assumptions, or recovery commands. Distinguish user input,
literal commands, placeholders, and example output.

Do not bury an instruction, requirement, or limit in a note. Promote it into the
appropriate procedure or reference section while preserving its force and scope.
This follows Issue 9, Rule 5.5, in the
[official standard](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf).

Keep the project's approved risk labels and hazard wording. Give the preventive
action and consequence when known. If a risk classification needs expert review,
flag it; do not infer the classification from tone or from the word "warning."

## Requirements and uncertainty

Distinguish an instruction, an obligation, a recommendation, an expected result,
a possible result, and an observed state. "The value should be true" is ambiguous
unless the context establishes which meaning applies. Do not use a universal
`should` to `must` or `may` to `can` substitution.
See [Google's prescriptive-documentation guidance](https://developers.google.com/style/prescriptive-documentation).

If the document adopts BCP 14, preserve its
[requirement keywords](https://www.rfc-editor.org/rfc/rfc2119.html) and
[capitalization convention](https://www.rfc-editor.org/rfc/rfc8174.html).
Normative statements can also exist without uppercase keywords. Check their
meaning, not only a keyword list.

Remove redundant hedging only when the degree of uncertainty remains unchanged.
Do not change "A network interruption may have caused the failure" into a
confirmed diagnosis. A style improvement cannot supply missing evidence.

## Accessibility and useful structure

Use meaningful headings and link text. Do not identify a control only by color,
shape, or a visual location. Preserve supported input alternatives. Make images
and tables understandable in their surrounding text, using the publication's
accessibility conventions. Clear vocabulary alone is not an accessibility audit.
See [Microsoft's accessibility guidance](https://learn.microsoft.com/en-us/style-guide/accessibility/writing-all-abilities).

Avoid an unconditional "AI words" blocklist. Words such as "significant" can have
precise technical meanings. Remove unsupported praise or replace it with an
already-supported fact; do not invent a metric to justify it.

## Original examples

The examples are synthetic software prose, not verified STE-compliant text.

### Preserve the scope of a condition

Before:

> If `retry_enabled` is `true`, set `timeout_ms` to `3000`, restart the worker,
> and wait until the worker reports `Ready`.

After:

> If `retry_enabled` is `true`, complete these steps:
>
> 1. Set `timeout_ms` to `3000`.
> 2. Restart the worker.
> 3. Wait until the worker reports `Ready`.

The condition applies to every step. Do not drop it or move it to a single step.

### Keep an unresolved antecedent unresolved

Source:

> When the client disconnects from the worker, it retries after 5 seconds.

Finding:

> The source does not identify whether the client or worker retries. Identify the
> retrying component before replacing "it."

Do not choose a component because the resulting sentence reads better.

### Leave accurate prose alone

Source:

> The worker reads the queue every 5 seconds.

If this is supported and fits the audience, retain it. No rewrite is necessary.
