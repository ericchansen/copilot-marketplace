# Fantasy roster management

## Build the observed league brief

Record each setting with its actual source/time and observed, unknown,
conflicting or not-applicable status. Public defaults do not fill gaps.

| Area | Inventory |
| --- | --- |
| Format | Sport, competition, season, current joined team count versus configured maximum teams, start blockers, head-to-head/points/categories/rotisserie or other format, scoring period |
| Scoring | Full categories/weights with separate league/default values, receptions (standard/half-PPR/PPR when relevant), bonuses, penalties, fractional points, tie rules |
| Roster | Active/bench slots, provider position eligibility, flex/superflex allowed positions, IR/IL/NA rules and constraints |
| Draft | Scheduled draft time/timezone, lobby opening time/state, order availability/release condition, required completion-before-scoring deadline, completed versus not completed, snake/auction/other, timer, nomination/budget rules, keepers |
| Timing | Sport schedule, scoring start, daily/weekly/per-player locks, lineup changes, postponed/cancelled games |
| Acquisitions | Free agents versus waivers, waiver type/run time, priority/ties, FAAB/minimum bid, remaining and committed budget, acquisition limits |
| Trades | Deadline, review/veto process, eligible assets, restrictions, pending offers and roster consequences |
| Season | Playoffs/tiebreakers, keeper/dynasty costs and future picks, commissioner announcements, transaction limits |

Map **each scoring rule** to its labeled **LEAGUE VALUE** and separate
**PROVIDER DEFAULT VALUE** (unknown/not displayed when absent), with the
source/time. Never substitute the adjacent default for a custom league
setting. Flattened accessibility text can interleave row values and columns:
verify row/header associations using the supported structured view or a
targeted screenshot before mapping them. If that association remains unclear,
mark the league value unknown and withhold scoring-dependent conclusions.

Don't turn an unknown scoring category into zero. If an essential setting is
unavailable, provide conditional alternatives and withhold a definitive
ranking or transaction. For football, compare standard versus PPR explicitly
when receptions change the ordering. Do not assume a flex allows quarterbacks:
verify flex and superflex separately.

For baseball, basketball, hockey or another sport, map the actual scoring
categories, ratios, minimums, games/innings caps, eligibility and schedule.
Daily versus weekly lock rules, multi-game days, doubleheaders, postponements,
rest and starting-pitcher/goalie confirmations may matter. Do not import
football weeks, PPR, byes or NFL injury labels as universal rules. Optimize
the observed points/category objective, not a generic football ranking.

## Draft preparation and live assistance

Confirm the draft exists, its current state and scoring-start implications.
A warning that a draft must finish before scoring is not proof of the draft
time, completion status, roster or agent rules. Before drafting is complete,
provide preparation rather than inventing an active lineup.

Count actual joined teams from current membership/standings; configured
maximum teams is capacity, not participation. Surface observed league-start
blockers, such as a site warning that an odd head-to-head team count prevents
starting. Do not assume that every sport/format has that restriction or fix
it through commissioner settings.

Keep scheduled draft time, lobby opening time, draft-order availability and
the required finish-before-scoring deadline distinct, with their sources and
timezones. If random order releases only when the lobby opens, record it as
unavailable until then; do not invent the order. A countdown alone proves
neither readiness nor that membership, order and scoring-start gates are
satisfied. Empty chat or no commissioner message means agent-specific rules
remain unknown, not that there are none or that automation is authorized.

Use current scoring-compatible projections and observed player availability
to create tiers, roster/positional needs, replacement-value comparisons,
keeper costs and a legal shortlist. For auction/salary-cap formats, track
remaining budget, mandatory roster fill cost and maximum legal bid. For snake
drafts, verify pick order/current pick; don't assume all nominations are picks.

In a live draft, re-read the board, clock, selected player, roster, budget and
turn before a proposed selection. Present an ordered shortlist with reasons.
Submit only under explicit pick/bid authority or bounded standing authority.
Agree fallback candidates, maximum bid, expiry and timer behavior **before**
time pressure. If no authorized fallback remains, stop and disclose the risk
of the platform's own timer/autopick; do not guess permission or change queue/
autodraft controls without authorization. Verify the drafted player on the
board/roster, not just a selection highlight.

## Lineup review

Start from the currently saved roster for the selected scoring period.
Check injuries and official availability, provider slot eligibility, byes/
off-days, expected role/minutes, opponent, scoring-compatible projections,
lock state and news times. A projected starter is not confirmed active.

Compare only legal assignments: no duplicate player across slots, no locked
player moves, no IR-ineligible placement, and no illegal roster size. Inspect
whether an invalid IR occupant blocks other moves. Explain the specific
constraint rather than proposing a workaround or assuming an injury makes
the player eligible. Preserve late-game flexibility when legal, accounting
for flex/superflex eligibility and the actual lock rules.

Show current slot -> proposed player, expected scoring fit, alternatives,
availability risk and latest legal decision time. A legal lineup may still
benefit from changes; majority picks or player-name reputation are not review.
Use the action protocol for saving and reloading every changed slot.

## Waivers and free agents

Verify the player's current availability, waiver versus free-agent state,
claim processing time and acquisition eligibility. Inspect priority or FAAB
rules, bid increments/minimum, remaining funds, pending bids, roster space,
drop restrictions, transaction caps and existing claims.

For each proposal show add, conditional drop if needed, claim order,
maximum bid in fantasy units, projected role/scoring fit, alternatives and
post-action roster/budget. Account for mutually exclusive claims, multiple
possible wins and repeated conditional drops using the provider's actual
claim-processing rules. Do not assume pending bids reserve funds or that
all can safely win; require worst-case aggregate affordability under the
observed mechanism and user limits. If the mechanism is unknown, block
spending rather than treating the unknown as uncommitted funds.

Insufficient FAAB, a protected/undroppable player, an exhausted transaction
limit or locked/ineligible roster means revise or withhold, not overspend
or silently choose a different drop. Real-money entry or fees require
separate authority. Confirm pending claims in the transaction list and later
reconcile actual awards, losses, charged budgets and roster changes.

## Trades

Evaluate both sides for this league's scoring, roster needs, scarcity,
schedule/playoffs, keeper costs and future assets when applicable. Describe
uncertainty and reasonable alternatives, not a universal trade-value score.
Verify eligibility, deadline, review rules, existing offers and resulting
roster size/slots. Never manipulate another team or commissioner settings.

Offer, counter, accept, reject and cancel are distinct authorized actions.
Reconcile pending/ambiguous offers before sending another. Record acceptance,
review, completion or rejection separately; do not assume instant transfer.

## Matchup, schedule and season review

Show saved lineup, opponent/period, remaining eligible games/players, live
versus projected points/categories, relevant injuries and legal alternatives.
Inventory independent draft, game, lineup, waiver, trade and playoff
deadlines in source timezone plus user timezone, including UTC offsets for
the event date. Avoid ambiguous abbreviations and handle daylight-saving
changes. Check postponed games rather than assuming the original lock.

Track official and corrected results using the evidence protocol. Evaluate
draft/lineup/acquisition decisions using their recorded pre-decision evidence,
cost and legal alternatives. Label retrospective comparisons as hindsight;
do not manufacture previous recommendations or submissions from chat.
