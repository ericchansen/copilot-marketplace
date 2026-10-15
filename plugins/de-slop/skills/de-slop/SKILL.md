---
name: de-slop
description: >-
  Delete or recommend deleting code, tests, documentation, configuration,
  generated artifacts, and UI that cost more to maintain than they currently
  earn. Use for de-slop reviews, redundant or low-value tests, SDK tests, copy
  tests, dead code, unnecessary abstractions, speculative compatibility, stale
  UI, duplicate sources of truth, or requests to identify what should be
  removed. Every test must catch a plausible regression in behavior owned by
  this codebase; if no realistic bug is uniquely caught, delete or do not add
  the test. Review only by default; modify the target only when explicitly asked.
license: MIT
allowed-tools: Bash, PowerShell
---

# De-slop

Delete maintenance cost that does not earn a current durable requirement or an
observable user benefit. Evidence decides; age, style, and line count do not.

Preserve security, validation at trust boundaries, accessibility, error
handling that prevents data loss, and behavior backed by a demonstrated current
requirement. Simpler but wrong is not de-slopped.

## Tests must catch our bugs

Ask of every test:

> What plausible bug in our code would this catch?

A useful test would fail for a realistic regression in behavior this codebase
owns, while the rest of the suite could still pass. If there is no concrete
answer, delete the test or do not add it.

A test earns its cost when it protects at least one of these:

- a known regression;
- a nontrivial transformation or decision owned by this codebase;
- a security or trust boundary;
- error handling whose failure would be externally meaningful;
- a compatibility boundary this product intentionally supports;
- persistence, migration, or data-loss risk;
- a durable user-visible, accessibility, legal, or protocol contract.

Tests are slop when they:

- re-prove documented SDK, library, or framework behavior;
- assert a constant or literal equals itself, including ordinary website copy
  with no durable wording contract;
- mirror implementation branches, mocks, helper calls, or internal data
  structures instead of externally meaningful behavior;
- test compiler or type-system guarantees, trivial getters, setters,
  constructors, generated code, or framework defaults;
- snapshot or enumerate output merely because it exists, with no named product
  or user invariant;
- duplicate stronger integration or contract coverage;
- memorialize deleted features, migrations, incidents, or named historical
  artifacts;
- require production abstractions, hooks, options, or registries solely to make
  trivial tests possible.

For a third-party SDK, test our adapter, configuration, serialization, version
boundary, or deployment interaction only when it could realistically break.
Do not call a documented SDK with `x`, assert the guaranteed `y`, and pretend
that tests our product.

For user-facing copy, test semantic behavior, accessibility, required legal
wording, or a protocol contract. Do not test that a string assigned `"cat"`
still equals `"cat"` or pin ordinary prose to its current literal.

## Audit the rest

Inspect the current code, callers, tests, documentation, configuration,
generated output, rendered UI, and focused history. Do not infer a requirement
from the mere existence of code, a comment, a test, or an old incident.

Find evidence for deletion:

- historical tombstones and named exceptions preserving deleted or legacy
  behavior;
- duplicate metadata, manifests, sources of truth, and hand-maintained
  generated data;
- abstractions, profiles, options, registries, fallbacks, and compatibility
  paths with no real variation, verified ecosystem, or current consumer;
- comments and documentation whose only purpose is to explain unnecessary
  code;
- internal implementation details, catalog history, redundant instructions,
  or stale static values exposed as if users need them;
- UI elements and instructions that consume attention without helping a user
  understand state or take action.

Trace each candidate to current callers and behavior. Future-proofing,
speculative compatibility, and "we might need it" are not requirements.

Remove the shared cause, not one symptom. When an abstraction exists only for a
worthless test, delete both. When code exists only to support an obsolete
exception, delete the exception, code, tests, docs, configuration, generated
artifacts, and UI exposure together.

## Report

Report only high-confidence findings. If the evidence does not justify
deletion, do not invent a finding. If no high-confidence waste exists, say so.

Rank findings by removable maintenance burden. For each one state:

- **What exists:** cite the file, line, caller, history, test, or rendered UI.
- **Why it does not earn its cost:** name the missing current requirement or
  user benefit. For a test, answer the plausible-bug question directly.
- **Smallest safe deletion:** include dependent tests, docs, configuration,
  generated artifacts, and UI that become unnecessary.
- **What must remain:** identify any behavior or boundary that still needs
  protection.

Remain review-only unless the user explicitly requests fixes.
