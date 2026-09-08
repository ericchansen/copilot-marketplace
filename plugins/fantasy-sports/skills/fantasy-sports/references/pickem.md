# Pick'em: a separate route

Verify group and owned pick set, season and slate, not a fantasy roster/team.
Read the actual group rules and currently saved picks before advice.

## Winning condition and deadlines

Identify **straight-up** versus **against the spread (ATS)**, then whether
confidence points additionally weight those outcomes. Verify allowed weights,
uniqueness, missed games, dropped weeks, playoffs, tie/push/void rules and
tiebreaker fields/order. Never assume a fixed 16-game card or standard
regular-season weights for every slate. Official Yahoo references are linked
from `SKILL.md`; actual group settings and current fields control.

Read each game's pick deadline/lock and any independent confidence-weight
or tiebreaker deadlines. A Sunday game or Monday score field may lock earlier
than kickoff. Preserve source timezone and convert to an unambiguous ISO
timestamp with the correct event-date UTC offset. Do not infer deadlines from
game start, weekday, old screenshots or a generic weekly rule.

## Record the exact evidence

For each matchup retain team identity, home/away, event date, selected team,
**signed handicap for that team**, exact site spread text, captured time,
site spread provisional/final/frozen/unknown status, saved pick and lock.
If the page does not reveal spread status, mark unknown rather than frozen.

External comparison needs the exact same event, selected side, signed
handicap, game/period, overtime treatment and settlement/void conditions,
with both sides' prices where available, source URL and quote time.
Distinguish the site's potentially frozen league line from a current market.
Do not silently replace the league spread with a market spread.

Public pick distribution is **popularity**, not probability or analytical
confidence. It may describe outright picks rather than ATS; verify what it
measures. A lone dated snapshot proves neither movement nor a flip. A
movement claim needs at least two comparable timestamped observations of
the same event, source, outcome and line definition.

Never treat randomized "coin toss" jokes or random prediction widgets as
sporting evidence. A provider's actual random end-of-season tie procedure,
if documented and applicable, is a settlement rule, not predictive evidence.

## ATS arithmetic and probabilities

Let `M = selected team's score - opponent's score` and `H = selected team's
signed handicap`. For ordinary ATS settlement, **verify the group uses**:

- `M + H > 0`: selected team covers.
- `M + H = 0`: push; apply the group's observed push rule.
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

A moneyline estimates an outright win event, **not** `P(M + H > 0)`.
Neither favorite status nor a large win probability establishes an ATS edge.
A predicted average/median margin is also not a margin distribution and
does not supply cover probability.

If using paired decimal odds `dA`, `dB` for the **same** handicap market,
raw implied weights are `qA = 1/dA`, `qB = 1/dB`. A proportional margin
removal estimate is `qA/(qA + qB)`, not a guaranteed true probability.
State the method and bookmaker-margin/model limitations. American odds
convert to raw implied weight with `a/(a+100)` for `-a`, or
`100/(b+100)` for `+b` (positive `a`, `b`).

For integer lines with refunded pushes, paired prices generally do not
identify unconditional win/loss/push probabilities. Treat the normalized
estimate as conditional on a non-push under that settlement assumption.
Without a justified margin distribution or push estimate, do not label it
an unconditional cover probability or use it as unconditional expected
Pick'em points. League push scoring may differ from a market refund.

A quote at -3.5 cannot substitute for -3, -2.5 or the opposite side's +3
without a defensible distribution or an exact alternate-line market.
Re-evaluate when a line crosses or lands on a sport-relevant common margin
("key number"; e.g. 3 or 7 in American football). These are not universal
across sports, and do not imply any fixed numeric change in probability.
If matching data is absent, show qualitative factors and **low confidence /
no quantified edge** rather than fabricate a conversion.

## Recommendations and tiebreakers

For each pick, present current saved choice, exact league handicap/status,
matching evidence, proposal or withhold, rationale, uncertainty and deadline.
Discuss favorites and underdogs on the same basis. A majority-backed card
alone never justifies "nothing needs changing."

If confidence weights are enabled, use the actual allowable set and locked
assignments. Rank by the relevant scoring event and expected points only
when evidence supports it; do not map public pick percentages into weights.
Discuss contest objectives and uncertainty instead of inventing precision.
If missing evidence leaves the ranking weak, disclose that rather than
pretend all games have measured probabilities.

Tiebreaker score forecasts are **separate** from ATS selections. Identify
each requested field (home score, away score, total, high/low team, or
other), exact game and independent deadline. Support score forecasts with
dated sport-appropriate projection/total evidence and label them projections.
A projected 24-21 score at Harbor -3 implies a push under the rule above,
not an ATS recommendation to take Harbor. If a separate distribution/model
supports an ATS choice despite that point forecast, explain the distinction;
never manufacture an edge from rounding.

## Submit and track

Use the evidence/action protocol for scoped approval and one-time submission.
Re-read line/status, locked games, current selections and all tiebreakers
before saving. If a provisional spread changes, re-evaluate legality,
recommendation and authorization; don't assume an old approval covers it.

After save, reload/reopen the correct group's entry and verify **every
authorized selection, confidence value and tiebreaker field**, plus any
unchanged locked items. Record the exact saved values and any provider
confirmation timestamp/status. A highlighted choice, prior chat, or
successful navigation is not proof. If fields didn't persist or the save
is ambiguous, reconcile before retry; state exactly which remain unverified.

Score results at the league's recorded applicable handicap and observed
rules, not the latest market line. Track live/provisional, official,
corrected, push and void statuses separately, including tiebreakers.
Do not infer that advice was submitted when evaluating past performance.
