# Review rubric and evaluation

This is an original acceptance rubric for the plugin, not an ASD assessment or a
claim of measured effectiveness. It follows
[STEMG's guidance on AI accountability and benchmarks](https://www.asd-ste100.org/assets/files/WhitePaper-ASD-STE100_and_AI.pdf).

## Review the requested scope

In review mode, do not edit the document. In revise mode, inspect the actual diff,
including protected literals. In draft mode, compare each substantive claim with
the evidence; there is no original prose whose correctness can be assumed.

| Priority | Finding | Treatment |
|---|---|---|
| Blocking | Invented fact, changed obligation, negation, value, identity, causal claim, or hazardous sequence | Correct from evidence or report the gap; do not call the artifact complete |
| Material | Unresolved referent, hidden required step, unsupported recovery, conflicting terminology or source | Explain the reader consequence and provide a correction only when supported |
| Advisory | Awkward sentence, repetition, noun stack, or style departure without changed meaning | Recommend a small edit only if it improves this document |

This severity is about documentation consequences, not a security-vulnerability
rating. Do not create findings simply to fill every category.

Each finding should identify the location, problem, evidence, and supported
correction or unresolved question. If reporting tool results, distinguish an
exact match from a heuristic or model judgment. Use an Issue 9 rule number only
when the source and applicability have been verified.

## Completion checks

- Every required fact, condition, exception, and result remains present.
- No new unsupported actor, cause, command, value, or claim has appeared.
- Negation, AND/OR logic, scope, and normative force are preserved.
- Literal content is unchanged unless its change was explicitly in scope.
- Actions retain their prerequisites, order, concurrency, and stop conditions.
- Instructions, observations, notes, and requirements remain distinguishable.
- Names, definitions, and citations refer to the intended entities.
- Unknowns remain explicit; already-good text has not been edited gratuitously.
- The output operation matches the request, including read-only review.

Model self-review is not independent proof. High-consequence content still needs
qualified review. Neither a readability grade nor a zero-finding linter result
establishes comprehension or technical correctness.
See [STE tool limitations](https://www.asd-ste100.org/STEsoftware.html).

## Existing tools first

Use the repository's existing link, Markdown, spelling, build, or documentation
checks when appropriate. Do not install a new tool just to produce a "passed"
line. Say which material checks could not be performed.

[Vale](https://docs.vale.sh/) and [textlint](https://textlint.org/docs/getting-started)
are optional infrastructure, not dependencies of this skill. If a project already
uses one, inspect enabled rules, scope, version, and protected regions before
interpreting findings. Treat passive-voice detection as heuristic. A length
checker is not an STE counter unless its counting model supports the applicable
rules. Avoid conflicting style profiles; for example, a contraction preference
does not agree with strict STE.

## Maintainer evaluation protocol

The main skill links a synthetic JSON case set. Each record supplies a request,
an operation, a profile, source facts, input text, and grading expectations.
These are behavioral cases, not an automated test runner or passing results.

1. Run the candidate in a fresh context with the skill and its normal references.
   Supply only the case's `request`, `source_facts`, and `input` as user context.
   The `operation`, `profile`, and `expected` fields are evaluator labels.
2. Do not show the candidate the case set, evaluator labels, or expected outcomes
   while it answers. The runtime review rubric remains part of the skill; the
   fixture's `expected` fields do not. Do not let it open the fixture through a tool.
3. Use an isolated, disposable workspace if file behavior is part of the case.
   Do not execute example commands, invoke external services, or change real data.
4. Capture the full output and any actual tool/file changes outside the plugin.
5. Compare with `expected`. Grade meaning before style. Record missed defects,
   invented defects, unsupported assertions, and unexpected tool/file actions.
6. Repeat relevant cases after a skill change. Keep model, settings, supplied
   sources, and skill revision with the results.

For each case, use **pass**, **fail**, or **not exercised**, with a short reason.
Fail if any prohibited behavior occurs or a required invariant is lost. A
different wording is not a failure when it preserves the required meaning.
Do not describe a textual simulation as proof of actual file or tool behavior.
Do not count all cases as passed because the fixtures are valid JSON.

The fixture set covers protected identifiers and normative wording, condition
scope, unknown actors and pronouns, missing evidence, notes, explanations,
unnecessary edits, reference-source limits, embedded instructions, long names,
concurrency, and format-only requests.

## Stronger evaluation

Compare the skill with the unchanged document, a plain clarity prompt, and good
professional editing where feasible. Use representative readers and real tasks,
not only model-generated scores. Blind reviewers to the producing method and
counterbalance exposure to document variants.

Measure factual regressions and critical errors first; then comprehension and
task success; then false-positive burden and editing effort. Word count and
readability are supporting diagnostics, not sufficient acceptance criteria.

Historical controlled-language studies found context-dependent results, not
universal gains or proof of a current agent skill's effectiveness:

- [Holmback, Shubert, and Spyridakis (1996)](https://aclanthology.org/www.mt-archive.info/90/CLAW-1996-Holmback.pdf):
  procedural comprehension and evaluation limitations.
- [O'Brien and Roturier (2007)](https://aclanthology.org/2007.mtsummit-papers.46/):
  rule effects vary across translation systems and constructions.
- [O'Brien (2010)](https://doras.dcu.ie/17153/):
  mixed readability results and the need for usability-oriented evaluation.

Report measured outcomes with their scope and limitations. Do not advertise
guaranteed safety, productivity, or conformance benefits.
