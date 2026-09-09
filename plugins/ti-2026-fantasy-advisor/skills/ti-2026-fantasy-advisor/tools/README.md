# Token-aware horizon analyzer

`horizon-analyzer.js` compares current roll choices across the tokens remaining.
It uses the [pinned helper engine](vendor/README.md) for banner valuation and
operation transitions, then runs seeded Monte Carlo rollouts for future offers.

## Requirements

- Install [Node.js](https://nodejs.org/en/download) 20 or newer and put `node` on
  PATH. The CLI and tests use only Node built-ins: no npm packages or install step.
- Keep this whole skill directory together: `horizon-analyzer.js` resolves
  `vendor/calc.js` and `vendor/rolls.js` relative to itself, not the shell's
  working directory. Quote paths containing spaces.
- For real analysis, supply a compatible, separately obtained model `data.json`
  and the user's complete state JSON. Neither personal state nor historical
  match data is bundled. The CLI makes no network calls or automatic downloads.
- Browser access is needed only for the live helper/roster optimizer, supplied
  by the host or a normal browser. No browser, MCP server, Python, R, Java,
  replay parser, or OpenDota credentials are required by this CLI.

## Real-data setup

The engine is pinned to commit `fff2663466b70cc8810d02cdbf495523098784e7`.
Its compatible [upstream data export](https://github.com/VirenDias/ti15-fantasy/blob/fff2663466b70cc8810d02cdbf495523098784e7/docs/data.json)
is a historical Group Stage snapshot, not a current-data guarantee. Upstream
[explicitly excludes match data from MIT](https://github.com/VirenDias/ti15-fantasy/blob/fff2663466b70cc8810d02cdbf495523098784e7/readme.md#licence).
Check the data's applicable terms or obtain permission before acquiring or
redistributing it; do not infer a license from its public availability. If
permission or suitable current data is unavailable, use the
[live helper](https://virendias.github.io/ti15-fantasy/) or the qualified fallback
guidance instead.

Save permitted data and user state in your own working/session directory, not
inside the installed plugin or repository. Keep the data's `meta.period`,
generation date, roster coverage, and banner layout intact. A period mismatch
is rejected; stale dates/rosters still require human verification.

Set `$skill` to this skill's installed directory (the directory containing
`SKILL.md`). The state and data paths below are relative to your shell:

```powershell
$skill = "<installed-skill-directory>"
node "$skill\tools\horizon-analyzer.js" `
  --state ".\state.json" `
  --data ".\model-data.json" `
  --trials 500 `
  --json
```

`--data` reads JSON only, never JavaScript. Without `--data`, the CLI looks for
`data.json` in its model directory and fails with setup guidance when absent.
It never silently substitutes synthetic data.

## Synthetic smoke test

Both examples are invented fixtures, not a saved user's banner or tournament
observations. `synthetic-model.json` contains tiny artificial point rows and
marks `meta.synthetic: true`. Reports retain `model.synthetic: true`, and text
reports display a prominent warning. Never use their scores for recommendations.

From any working directory, with `$skill` set as above:

```powershell
node "$skill\tools\horizon-analyzer.js" `
  --state "$skill\tools\examples\synthetic-state.json" `
  --data "$skill\tools\examples\synthetic-model.json" `
  --trials 3
node --test "$skill\tools\horizon-analyzer.test.js"
```

The fixture uses two tokens and two root strategies to exercise continuation
quickly. It is not a statistically useful analysis.

## State and CLI options

Start from `examples/synthetic-state.json`, replacing all values. The state has:

- required integer `period` matching the data and `tokens` of at least one;
- all three banners in slot order, using the helper's stat/quality/trait labels;
- exactly three distinct current `offers`;
- optional `trials` (default 500), integer `seed`, and `objective`
  (`expected`, `ceiling`, or `floor`);
- optional `candidates`: `"Reroll Roll Operations"` or an
  `{ "operation": "...", "role": "Core" }` object;
- optional `candidateLimit` (default 4) for automatic root selection;
- optional positive `offerWeights` keyed by operation name; omitted weights are 1.

Rerolling offers is always included in root comparisons. `--trials` and `--seed`
override state values. `--all-actions` includes every applicable current
operation when `candidates` is absent; explicit candidates take precedence.
`--json` emits structured output; `--quiet` suppresses progress. Use `--help`
for the complete CLI syntax.

Paths passed through `--state`, `--data`, and `--model-dir` are relative to the
shell's working directory; bundled engine paths remain script-relative.

## Runtime and interpretation

Real datasets and longer token horizons cost much more than the tiny fixture.
First time a few trials using the actual token count and only plausible root
candidates. Expand to 500 screening trials, then 2,000 for close paired
comparisons only when the measured cost permits. `--all-actions` can be costly.
Runtime is not guaranteed to scale linearly because evaluation caches grow.

There is no checkpoint/resume: progress goes to stderr, while the final report
is emitted only on completion and nothing is saved automatically. Keep runs
below ten minutes; reduce trial/candidate budgets and save each completed JSON
report in the session workspace. An interrupted run loses its in-memory work.
Tiny trial counts are diagnostic, not recommendation-quality confidence.

The default future-offer model samples three distinct operations uniformly.
Continuation takes the highest positive one-step expected-value action;
otherwise it spends the token rerolling offers. This is policy evaluation,
not a solved optimal policy. Compare against stopping (zero improvement) too.

The helper's [banner scorer](https://github.com/VirenDias/ti15-fantasy/blob/fff2663466b70cc8810d02cdbf495523098784e7/docs/calc.js)
averages across each role's teams, without conditioning on a chosen roster or
Title. Series maxima are binned; transition enumeration is not a guarantee of
exact real-world scores. `mean`, `p10`, and `p90` describe modeled terminal
improvement. Paired `versusReroll` intervals cover Monte Carlo noise only,
not unknown Valve odds, stale data, or a suboptimal future policy. Read the
[methodology](https://github.com/VirenDias/ti15-fantasy/blob/fff2663466b70cc8810d02cdbf495523098784e7/methodology.md)
and re-run after each actual roll.

## Updating the engine

To use a newer compatible checkout without modifying the installed plugin:

```powershell
node "$skill\tools\horizon-analyzer.js" `
  --state ".\state.json" `
  --model-dir ".\trusted-helper\docs" `
  --trials 500
```

The directory must contain a matching `calc.js`, `rolls.js`, and `data.json`,
unless `--data` supplies the JSON elsewhere. Only use a trusted checkout:
`--model-dir` loads and executes its JavaScript with your user permissions.
Review license changes and rerun the tests before replacing vendored code.

## Repository CI command

From the marketplace root:

```powershell
node --test .\plugins\ti-2026-fantasy-advisor\skills\ti-2026-fantasy-advisor\tools\horizon-analyzer.test.js
```

The tests are offline and use synthetic data only.
