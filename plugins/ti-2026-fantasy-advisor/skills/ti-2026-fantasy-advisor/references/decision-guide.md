# Decision guide

Mechanics and model assumptions below follow the
[pinned helper methodology](https://github.com/VirenDias/ti15-fantasy/blob/fff2663466b70cc8810d02cdbf495523098784e7/methodology.md).
Verify current tournament details through the sources in `sources.md`.

## Fixed War Banner layouts

Period 1 uses three slots:

| Role | Slot colours |
|---|---|
| Core | Red, Green, Red |
| Mid | Red, Blue, Green |
| Support | Blue, Green, Blue |

Period 2 preserves those slots and adds two:

| Role | Slot colours |
|---|---|
| Core | Red, Green, Red, Green, Red |
| Mid | Red, Blue, Green, Red, Green |
| Support | Blue, Green, Blue, Green, Blue |

The original three Emblems carry into Period 2. Players and the shared Title can be
changed freely before roster lock. Roll Tokens are spent on War Banner operations, not
on changing players or Titles.

## Quality values

| Quality | Base stat bonus |
|---|---:|
| Tier I | 10% |
| Tier II | 30% |
| Tier III | 60% |
| Tier IV | 100% |
| Tier V | 150% |

Valve does not publish complete roll odds. The helper estimates quality-roll weights
from observed rolls as 5:4:3:2:1 for Tiers I through V. Treat exact quality-operation
EV as model-based rather than guaranteed.

## Trait interactions

Traits alter effective multipliers and must be evaluated across the entire banner:

| Trait | Effect |
|---|---|
| Fractal | +60% to itself if every quality on the banner is different |
| Benevolent | +20% to each adjacent Emblem |
| Vampiric | +50% to itself and -10% to each adjacent Emblem |
| Unique | +30% to itself if it is the banner's only Unique |
| Friendly | +50% to itself when at least three Emblems on the same banner are Friendly |

Position matters for Benevolent and Vampiric. A middle Benevolent can affect two
neighbours; an edge Vampiric penalizes only one neighbour. Friendly is all-or-nothing
until the threshold is reached. Fractal can switch off when qualities are rerolled.
Unique can switch off when another Unique appears.

Do not rank traits by name alone. The rough fallback preference from the broad guide
was Friendly when activated, then Vampiric, Benevolent, Unique, and Fractal, but actual
slot values and interactions can reverse it.

## Roll Operations

The game can offer:

- Reroll all Red stats, qualities, or traits.
- Reroll the first, last, or one random Red quality.
- Reroll all Blue stats, qualities, or traits.
- Reroll the first, last, or one random Blue trait.
- Reroll all Green stats, qualities, or traits.
- Reroll the first, last, or one random Green stat.
- Randomly increase one quality.
- Randomly increase two qualities and reduce one.

This asymmetry is exhaustive in the helper's published TI 2026 operation data:
targeted Red operations affect quality, targeted Blue operations affect trait, and
targeted Green operations affect stat. If the live game shows different wording after
an update, treat the game as authoritative and do not force it into the old list.

The exact wording matters. "First" and "last" mean the first/last Emblem of that colour
within the selected banner, not necessarily the first/last banner slot. Verify which
banner is selected in the game before advising a click.

The two redistribution operations prioritize qualities that can move in the promised
direction. If an increase selects Tier V or a reduction selects Tier I, that quality
can reroll unexpectedly instead of moving one tier in the named direction. Therefore
"increase" is not a guaranteed one-tier gain. Use the helper's complete outcome table
when possible.

## Multiple-roll horizon

The helper's recommendation is one move ahead. With several tokens remaining, a
negative immediate result can occasionally be offset by option value:

- A failed reroll can make a later targeted reroll positive EV.
- A successful high-tier result can be banked while future tokens target other slots.
- Rerolling the three offered operations preserves the banner but consumes one token
  before any new operation can be applied.

Use `tools/horizon-analyzer.js` (relative to the skill directory) for this
comparison, supplying separately obtained data as described in `tools/README.md`.
Never use the synthetic test model for real advice. Its default assumptions are:

- Three distinct operation types are drawn uniformly from the 20 published operations.
- Quality, trait, and stat outcomes follow the helper's exact transition model.
- Each future screen takes the highest positive one-step-EV action, otherwise it
  rerolls the offers.
- Terminal value uses the helper's exact banner scorer.

This is Monte Carlo policy evaluation, not an exact dynamic-programming solution.
Valve has not published operation-offer probabilities, and the greedy continuation
policy may miss strategic negative-EV setup moves. Report those limitations whenever
the horizon result changes the one-step recommendation.

Banner valuations average across the dataset's teams for each role, without
Title bonuses; they do not condition on the user's selected roster. The scorer
also bins series maxima, so enumerated transitions do not imply an exact
prediction of real fantasy points. Use the live roster/Title optimizer separately.

## Exact scoring implications

- A role's score is the average of its one or two selected players.
- The top two scoring games in a series are summed to form the series score.
- The best scoring series in the period forms the role score.
- Emblem stats on one War Banner share the same selected games; adding isolated
  per-stat maxima overstates the banner.
- Prefix and suffix triggers apply per player/game before the maxima are taken.

This structure rewards a distribution with attainable high outcomes. It is wrong to
rank only by a season mean, a single historical peak, or consistency alone. More
series provide more chances to realize a high-scoring series.

TI 2026's published Group Stage and ordinary Main Event matches are Bo3, with a Bo5
Grand Final, so a completed series normally supplies at least two games. Historical
Bo1 and Bo2 games in the source pool are observations used to model game outcomes, not
different scoring rules.

## Fallback roll procedure

Use this only if the live helper cannot be used.

1. Read every current slot and offered operation.
2. Mark each stat as excellent, acceptable, weak, or unknown using the role tables
   below.
3. Multiply importance conceptually by the displayed effective multiplier. A mediocre
   stat at 300% can be harder to replace than an excellent stat at 30%.
4. Identify coupled damage. An "all Red" operation can destroy other strong Red
   slots on the selected banner; it does not change the other banners. A targeted
   operation is usually safer.
5. Check trait dependencies before any quality or trait operation.
6. Compare the available operation's upside with everything it can damage.
7. Use token count to choose ceiling versus downside protection.
8. If uncertainty between two moves is material, say so and ask for the exact missing
   tier/trait/operation rather than inventing an exact EV.

### Role/stat baseline

These are broad fallback tiers, not substitutes for player-specific data.

| Role/colour | Baseline |
|---|---|
| Core Red | Creep Score >> GPM > Deaths (stable) / Tower Kills (volatile) > Kills > Madstone |
| Core Green | Roshan Kills / Teamfight Participation > Tormentor Kills >> Stuns >> Courier Kills / First Blood |
| Mid Red | Creep Score > GPM > Deaths (stable) / Kills (volatile) >> Madstone > Tower Kills |
| Mid Blue | Runes Grabbed >>> Camps Stacked / Lotuses Grabbed >>> other Blue stats |
| Mid Green | Teamfight Participation > Stuns (stable) / Tormentor Kills (volatile) >> Roshan Kills >> Courier Kills / First Blood |
| Support Blue | Wards Placed / Smokes Used / Camps Stacked / Lotuses Grabbed > Watchers Taken >> Runes Grabbed |
| Support Green | Teamfight Participation > Tormentor Kills > Courier Kills >> First Blood / Roshan Kills |

Player-combination analysis adds useful exchange rates:

These comparisons come from the
[Group Stage emblem-player study](https://www.reddit.com/r/DotA2/comments/1veps0k/ti_2026_fantasy_a_datadriven_look_at_emblemplayer/).

- Core without Creep Score loses roughly 10% at equal multipliers. About 150% Deaths
  can substitute for 100% Creep Score in the cited sample.
- Mid is most constrained. Strong near-optimal combinations contained both Runes
  Grabbed and Teamfight Participation; Red was the flexible slot.
- For Mid in the cited sample, roughly 300% Camps Stacked matched 100% Runes Grabbed,
  and roughly 140% Roshan Kills matched 100% Teamfight Participation.
- Support Wards, Smokes, and Camps were in a similar top band; Lotuses may also belong
  there, but the original player-combination dataset lacked reliable Lotus data.

Use those ratios only as directional Group Stage evidence, not timeless equations.

## Roster and Title procedure

Roster and Title choices must be evaluated together:

1. Remove eliminated teams and confirm substitutions.
2. Prefer the live Roster & Titles Optimiser for the user's exact banners.
3. Inspect expected scores over plausible numbers of series, not only the median.
4. Apply an external team-strength/advancement judgment because the helper does not.
5. Prefer teams likely to play enough series to realize a ceiling, while avoiding weak
   teams whose historical stat profile is inflated by opponents or sparse samples.
6. Pick the one shared prefix that overlaps the important Emblems across all roles.
7. Pick the suffix for the desired risk profile.

Prefixes depend on player hero pools and which Emblems carry the score. The most common
trigger is not always the highest-EV prefix, and a nominal +11% prefix is not
automatically better than +6% when it triggers less often in high-scoring games.

Suffix fallback:

- **the Underdog:** low bonus, broadly consistent fallback.
- **the Lucky:** high-variance upside.
- **the Clutch:** potentially strong, but historical Bo1/Bo2 data exaggerates how often
  a match is the last possible game of a series. Prefer the helper's positional model.
- **the Cruel:** plausible upside but historically lacked complete parser data; do not
  assign a precise value without current data.
- **the Decisive, the Patient, the Tormented, the Flayed Twins Acolyte:** generally
  rare or unreliable triggers in the broad guide.

Titles have lower impact than fixing a poor high-multiplier Emblem, but they are free
to change and scale with actual Emblem multipliers, so optimize them before lock.

## Confidence

Use **High** only when:

- All banners, operations, token count, period, and relevant roster/title state are
  readable.
- The live helper accepted the state.
- The recommendation is valid for the current tournament roster.

Use **Medium** when the complete setup is evaluated with fallback data or when only
non-decisive details are missing.

Use **Low** when OCR is uncertain, a roster/substitution lacks current data, the stage
is unclear, or the user supplied only effective multipliers without underlying
qualities/traits.
