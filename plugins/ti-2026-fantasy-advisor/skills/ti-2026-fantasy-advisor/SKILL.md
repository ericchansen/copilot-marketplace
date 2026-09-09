---
name: ti-2026-fantasy-advisor
description: Analyze a Dota 2 The International 2026 Fantasy setup from screenshots or text and recommend the single best next move. Use for War Banners, emblem stats, qualities, traits, reroll choices, roll tokens, roster/player pairs, titles, prefixes, suffixes, or requests such as "what should I roll?", "which option should I take?", "is my fantasy good?", and "optimize my TI fantasy."
license: MIT
allowed-tools: Bash, PowerShell, Read, Write
---

# TI 2026 Fantasy advisor

Read `references/decision-guide.md` before making a recommendation. Consult
`references/fallback-data.md` only when the maintained optimizer cannot answer the
question. Use `references/sources.md` to cite or qualify claims. Read
`tools/README.md` before using the token-aware horizon analyzer.

The goal is to give the user one concrete next action, not a generic tier list.

## Setup and portability

Resolve every relative reference from this installed skill directory, not the
current working directory. The local analyzer needs Node.js 20 or newer; it uses
only built-in modules, with no npm install. Live-helper evaluation needs browser
access supplied by the host; no browser or MCP server is bundled.

The MIT-licensed scoring engine is included, but historical match data is not:
the upstream license explicitly excludes it. Follow `tools/README.md` to supply
a compatible, separately obtained `data.json` using `--data`. Never use the
bundled synthetic model for a real recommendation, and never label external
match data MIT. Keep user screenshots, state files, and downloaded datasets
outside the installed plugin and repository.

## Intake

Accept one or more screenshots, pasted text, or both. Extract as much as is visible:

- Current period/stage and roster-lock context.
- Roll tokens remaining.
- The three offered Roll Operations.
- Core, Mid, and Support War Banners in slot order.
- Each Emblem's colour, stat, quality tier, trait, and displayed effective multiplier.
- Selected teams/players.
- Shared Title prefix and suffix.

For a screenshot, inspect the image before asking the user to transcribe it. Use the
fixed banner layouts in `references/decision-guide.md` to identify slot colours only
when the period is known.

Never guess unreadable text, quality tiers, traits, player names, or Roll Operations.
An effective multiplier is not enough to reconstruct a quality and trait combination.
If missing information can change the recommendation, ask for only that information,
preferably as a close crop. If it affects only precision, proceed with a clearly stated
assumption.

Normalize common aliases:

- TFP or Teamfight -> Teamfight Participation
- Creeps or CS -> Creep Score
- Stacks -> Camps Stacked
- Wards or observers -> Wards Placed
- Smokes -> Smokes Used
- Lotuses -> Lotuses Grabbed
- Madstones -> Madstone Collected
- Towers -> Tower Kills
- Torm or Tormentor -> Tormentor Kills

## Decide what is being optimized

Classify the request before scoring:

1. **Immediate roll choice:** compare the three offered operations across all banners,
   including rerolling the offered operations or stopping.
2. **Banner improvement:** identify the weakest high-impact slot and the most valuable
   type of future operation.
3. **Roster and Title:** optimize them together because both are free to change and one
   Title applies to the entire roster.
4. **Full setup:** first take any free roster/Title improvement, then recommend the best
   token-spending move.

Do not spend-token optimize a free player or Title problem.

## Prefer exact evaluation

Use the maintained [TI 2026 Fantasy Helper](https://virendias.github.io/ti15-fantasy/)
whenever the supplied state is complete enough.

For War Banners:

1. Open the helper in an interactive browser; it is client-side and a plain fetch may
   omit the controls and data.
2. Confirm the helper header's period matches the user's setup. Do not use a Group
   Stage export for the Main Event or vice versa.
3. Enter every slot's stat, quality, and trait for all three banners before evaluating
   any operation.
4. Confirm the calculated multipliers match the screenshot when they are visible.
5. Mark exactly the three Roll Operations offered in game.
6. Read the recommended operation and its Expected, Worst, and Best outcomes.
7. Compare operations across all three banners because Roll Tokens are shared.
8. If multiple tokens remain and repair value could reverse a one-step result, run
   `tools/horizon-analyzer.js` with the exact token count before recommending.

For rosters and Titles:

1. Enter the exact War Banners.
2. Use the Roster & Titles Optimiser, not isolated role or prefix rankings.
3. Exclude eliminated teams and invalid rosters.
4. Account separately for expected series opportunity and current team strength; the
   helper intentionally does not predict how far a team advances.

Treat the helper as the primary calculator, not an oracle. State material limitations:

- Roll recommendations look one move ahead.
- The separate horizon analyzer models multiple tokens, but its future policy is a
  greedy rollout rather than a solved dynamic program.
- Team advancement is not predicted.
- Sparse or missing recent data lowers confidence.
- A replacement player with no useful post-7.41 pro data cannot be ranked reliably.
- Live tournament changes can make static Reddit player tables stale.

If browser access fails, use the fallback procedure in
`references/decision-guide.md`, then the baseline rankings in
`references/fallback-data.md`.

## Apply risk correctly

Fantasy scores the average of the players assigned to a role, then takes the best two
games in a series and the best series in the whole period. High ceilings and variance
therefore matter; this is not a season-average or daily-consistency contest.

Use token count to interpret the helper:

- With many tokens left, a positive-EV move with strong Best upside can be reasonable
  even when its Worst outcome is poor and repairable.
- With few tokens left, prefer robust Expected value and protect the Worst outcome.
- On the final token, do not gamble away an already strong banner for a small upside.
- Never recommend a negative one-step-EV operation merely because it targets a
  weak-looking slot. Override the one-step result only when explicit horizon analysis
  shows enough continuation or repair value, and label the result as model-based.
- If no offered operation improves the setup, recommend rerolling the offered
  operations only when a realistically improvable slot remains. Otherwise recommend
  stopping.

Applying an operation and rerolling the three offered operations each consume a token
and replace the offers. Do not imply that rejected operations are refreshed for free.

## Token-aware horizon analysis

Use `tools/horizon-analyzer.js` when at least two tokens remain and one of these is true:

- The best immediate operation is negative EV but has substantial repairable upside.
- Rerolling offers and taking an operation are close.
- The user explicitly asks to account for all remaining rolls.

Create a state JSON in the session workspace using
`tools/examples/synthetic-state.json` as the schema, replacing every example value.
Include the exact banners, offers,
token count, and only the plausible root candidates when runtime matters. Run:

```powershell
node "<skill-path>\tools\horizon-analyzer.js" --state "<state.json>" --data "<model-data.json>" --trials 500
```

The state must name its period, which must match the external dataset. Check the
dataset's generation date and roster coverage; the pinned engine does not fetch
updates or predict eliminations. Read `tools/README.md` for runtime limits before
starting a long run. If usable match data is unavailable, use the live helper or
the qualified fallback instead of the synthetic fixture.

Use 500 trials for screening. If the leading strategies' paired confidence interval
overlaps zero, rerun the close candidates with 2,000 trials. The default model treats
the 20 operation types as equally likely and draws three distinct offers. Valve does
not publish those odds; use `offerWeights` only when defensible evidence exists.

Interpret the output correctly:

- `mean` is expected terminal improvement after all listed tokens.
- `p10` protects the floor; `p90` measures modeled ceiling.
- `Vs reroll offers` uses paired simulations and is the cleanest comparison.
- Monte Carlo intervals cover simulation noise, not incorrect offer odds or a
  suboptimal future policy.

Do not call the result an exact optimal policy. Re-run after every actual roll because
both the banner state and offered operations change.

## Recommendation order

Use this priority:

1. Correct invalid, eliminated, or freely changeable roster/Title choices.
2. Use exact one-step expected value for offered operations.
3. Preserve irreplaceable high-impact stats unless the quantified upside justifies the
   risk.
4. Improve Emblem stat fit before chasing quality or trait in a bad stat.
5. Improve quality before trait when stat fit is already good, unless the complete
   trait interaction creates a larger quantified gain.
6. Optimize traits as a three- or five-slot system, never as isolated labels.

Do not blindly apply the shorthand "stat, then quality, then trait" when the helper
shows a different result.

## Output

Lead with the decision:

**Best next move:** `<exact click/change, banner, colour, and affected slot(s)>`

Then provide no more than these concise items:

- **Why:** the decisive expected-value or fallback comparison.
- **Risk:** important Worst/Best tradeoff and how token count changes it.
- **Avoid:** the most tempting inferior offered option, when useful.
- **Afterward:** ask for the resulting screenshot only when another decision remains.
- **Confidence:** High for exact complete-state evaluation, Medium for complete
  heuristic evaluation, Low when data or OCR is materially incomplete.

When the state is incomplete, distinguish:

- **Best target:** what should eventually improve.
- **Best available move:** what the currently offered operations actually permit.

Do not dump every tier list or every possible roster unless the user asks. Do not claim
exact point gains from a heuristic. Cite the helper or relevant source when reporting
specific scoring claims.
