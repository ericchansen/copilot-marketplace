# Pick'em: a separate route

Verify group and owned pick set, season and slate before private reads or writes. These identify the Pick'em context, not a fantasy roster/team. Actual group rules and current saved picks supply the analytical baseline. The separate [operational evidence](pickem-operations.md) records the reported working CDP/form/Save path, scoped to its environment.

## Winning condition and deadlines

The winning condition is **straight-up** or **against the spread (ATS)**, optionally weighted by confidence points. The actual allowed weights, uniqueness, missed games, dropped weeks, playoffs, tie/push/void rules and tiebreaker fields/order determine scoring. A 16-game observation or regular-season weight set is not a constant for other slates. Official Yahoo references are linked from `SKILL.md`; actual group settings and current fields control.

Each game, confidence weight and tiebreaker can have an independent displayed deadline/lock. A Sunday game or Monday score field may lock earlier than kickoff. A slate-wide tiebreaker (for example predicting the team that scores the most or fewest points across the whole week) can lock at the first game of the slate, earlier than the individual matchups whose scores you also forecast. Source timezone and the event-date UTC offset produce an unambiguous ISO timestamp. Game start, weekday or an old screenshot alone does not establish that deadline.

## Exact evidence fields

Each matchup's evidence includes team identity, home/away, event date, selected team, **signed handicap for that team**, exact site spread text, captured time, provisional/final/frozen/unknown line status, saved pick and lock. An undisclosed spread status is unknown, not frozen.

External comparison needs the exact same event, selected side, signed handicap, game/period, overtime treatment and settlement/void conditions, with both sides' prices where available, source URL and quote time. The site's potentially frozen league line and a current market line are distinct quantities; substituting one changes the question.

Public pick distribution is **popularity**, not probability or analytical confidence. Its measured outcome may be outright picks rather than ATS. A lone dated snapshot proves neither movement nor a flip. A movement claim needs at least two comparable timestamped observations of the same event, source, outcome and line definition.

Randomized "coin toss" jokes or random prediction widgets are not sporting evidence. A provider's actual random end-of-season tie procedure, if documented and applicable, is a settlement rule, not predictive evidence.

## ATS arithmetic and probabilities

With `M = selected team's score - opponent's score` and `H = selected team's signed handicap`, the ordinary ATS interpretation below applies when the observed group rules use this settlement:

- `M + H > 0`: selected team covers.
- `M + H = 0`: push; its scoring follows the group's observed push rule.
- `M + H < 0`: selected team does not cover.

Synthetic examples (arithmetic only, not forecasts):

| Selection and result | Calculation | ATS result |
| --- | --- | --- |
| Harbor -3 wins 24-21 | 3 + (-3) = 0 | Push, not cover |
| Harbor -2.5 wins 24-21 | 3 + (-2.5) = 0.5 | Cover |
| Harbor -3.5 wins 24-21 | 3 + (-3.5) = -0.5 | Does not cover |
| Valley +3 loses 21-24 | -3 + 3 = 0 | Push |
| Valley +3.5 loses 21-24 | -3 + 3.5 = 0.5 | Cover despite losing outright |
| Valley +2.5 loses 21-24 | -3 + 2.5 = -0.5 | Does not cover |

A moneyline estimates an outright win event, **not** `P(M + H > 0)`. Neither favorite status nor a large win probability establishes an ATS edge. A predicted average/median margin is also not a margin distribution and does not supply cover probability.

For paired decimal odds `dA`, `dB` in the **same** handicap market, raw implied weights are `qA = 1/dA`, `qB = 1/dB`. A proportional margin removal estimate is `qA/(qA + qB)`, not a guaranteed true probability; an attributed estimate includes that method and bookmaker-margin/model limitations. American odds convert to raw implied weight with `a/(a+100)` for `-a`, or `100/(b+100)` for `+b` (positive `a`, `b`).

For integer lines with refunded pushes, paired prices generally do not identify unconditional win/loss/push probabilities. The normalized estimate is conditional on a non-push under that settlement assumption. Without a justified margin distribution or push estimate, it does not establish unconditional cover probability or unconditional expected Pick'em points. League push scoring may differ from a market refund.

A quote at -3.5 cannot substitute for -3, -2.5 or the opposite side's +3 without a defensible distribution or an exact alternate-line market. Crossing or landing on a sport-relevant common margin ("key number"; e.g. 3 or 7 in American football) changes the settlement cases being compared. These numbers are not universal across sports and imply no fixed numeric change in probability. Missing matching data supports qualitative factors and **low confidence / no quantified edge**, not a fabricated conversion.

## Recommendations and tiebreakers

A useful recommendation includes current saved choice, exact league handicap/status, matching evidence, proposal or withhold, rationale, uncertainty and deadline. Favorites and underdogs have the same evidence standard. A majority-backed card alone does not justify "nothing needs changing."

With confidence weighting, the actual allowable set and locked assignments constrain the remaining choices. Relevant scoring-event evidence and, where supported, expected points inform ranking; public pick percentages do not become confidence weights. Contest objectives and uncertainty remain explicit. Missing probability evidence leaves a qualitative ranking rather than measured precision.

Tiebreaker score forecasts are **separate** from ATS selections. Each requested field (home score, away score, total, high/low team, or other) has its actual game and independent deadline. Dated sport-appropriate projection/total evidence supports a forecast, not an official result. A projected 24-21 score at Harbor -3 implies a push under the rule above, not an ATS recommendation to take Harbor. A separate distribution/model can support an ATS choice despite that point forecast, but rounding the score supplies no such edge.

## Submit and track

Obtain scoped approval or verify standing authority using the evidence/action protocol. Re-read line/status, locked games, current selections and all tiebreakers before editing and saving. Reconfirm authorization if a material spread or proposal change falls outside the approved scope.

The stamped Yahoo operational log records the working sequence: canonical editable owned page, exact nested radio `.click()`, tiebreakers selected by unique `name`, explicit `Save Picks`, then hard reload. Its selectors describe the observed layout, not a permanent provider contract. This route continues through a normal sign-in/consent handoff when needed rather than stopping at a signed-out profile.

After Save, reload/reopen the correct group's entry and verify **every authorized selection, confidence value and tiebreaker field**, plus unchanged locked items. Record exact persisted values and any provider confirmation timestamp/status. Record a saved-completeness indicator ("N of N", complete/incomplete or tiebreakers-entered) as corroboration, not a substitute for each value: the aggregate can read complete while one field is wrong or stale. Reconcile an ambiguous save before retrying and identify the still-unverified fields.

A highlighted choice, prior chat or successful navigation is not proof of persistence. Results use the league's recorded applicable handicap and observed rules, not the latest market line. Live/provisional, official, corrected, push and void statuses remain separate, including tiebreakers; a past recommendation alone is not a submitted-pick record.
