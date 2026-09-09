# Group Stage fallback data

Use this file only when the maintained TI 2026 Fantasy Helper is unavailable. These
rankings were based on pre-tournament or Group Stage samples and can become stale as
teams are eliminated, players are substituted, or the helper receives new data.

Sources: the [emblem-player combination study](https://www.reddit.com/r/DotA2/comments/1veps0k/ti_2026_fantasy_a_datadriven_look_at_emblemplayer/),
[title analysis](https://www.reddit.com/r/DotA2/comments/1vkdlnd/ti_2026_fantasy_a_datadriven_look_at_titles/),
and [broad guide](https://www.reddit.com/r/DotA2/comments/1vble84/fantasy_league_2026_guide/).
These are historical summaries, not current roster recommendations or a bundled
match dataset.

## Player-specific combination findings

At 100% efficiency and using the cited P90 methodology, the theoretical best raw
combinations were approximately:

| Role | Best cited combination | Raw score |
|---|---|---:|
| Core | Falcons: skiter + AMMAR_THE_F; Creep Score / GPM / TFP | 5,208 |
| Mid | IRON WING: bzm; Creep Score / TFP / Runes Grabbed | 5,904 |
| Support | IRON WING: Ari + Whitemon; Smokes / Wards / TFP | 4,558 |

The role ceilings are not directly comparable after actual qualities/traits and team
opportunity, but the Mid constraint is important: Runes and TFP dominated every
combination within 90% of the best in that study.

### Core combinations near the optimum

With Creep Score / GPM / TFP unless noted:

| Approx. rank | Team | Pair | Relative score |
|---:|---|---|---:|
| 1 | Team Falcons | skiter + AMMAR_THE_F | 100.0% |
| 2 | Team Yandex | watson + DM | 99.6% |
| 3 | BoomBoys | Kiritych + MieRo | 98.4% |
| 4 | TEAM VISION | Satanic + Noticed | 96.6% |
| 5 | IRON WING | Pure + 33 | 94.4% |
| 6 | Aurora Gaming | Nightfall + Ws | 92.2% |
| 7 | Team Spirit | Yatoro + Collapse | 90.0% |

Without Creep Score, Deaths / GPM / TFP produced the best cited alternatives:

| Approx. rank | Team | Pair | Relative to unrestricted best |
|---:|---|---|---:|
| 1 | Aurora Gaming | Nightfall + Ws | 89.8% |
| 2 | BoomBoys | Kiritych + MieRo | 89.6% |
| 3 | TEAM VISION | Satanic + Noticed | 88.7% |
| 4 | Team Spirit | Yatoro + Collapse | 87.7% |

### Mid combinations near the optimum

Every listed near-optimal combination included TFP and Runes Grabbed. The Red stat
varied:

| Approx. rank | Team | Player | Red stat | Relative score |
|---:|---|---|---|---:|
| 1 | IRON WING | bzm | Creep Score | 100.0% |
| 2 | Team Falcons | Malr1ne | Creep Score | 96.6% |
| 3 | Team Falcons | Malr1ne | Deaths | 96.3% |
| 4 | IRON WING | bzm | GPM | 96.1% |
| 5 | Aurora Gaming | Mikoto | Creep Score | 95.6% |
| 6 | Aurora Gaming | Mikoto | Deaths | 95.6% |
| 7 | Team Liquid | Nisha | Creep Score | 93.4% |
| 8 | BoomBoys | gpk | Deaths | 91.1% |
| 9 | Team Spirit | Larl | Deaths | 90.8% |

The best cited Mid combination without TFP reached about 87% of optimum. The best
without Runes reached only about 79%, reinforcing that Runes is the hardest slot to
replace.

### Support combinations near the optimum

The cited P90 combination study found:

| Approx. rank | Team | Pair | Blue/Blue/Green pattern | Relative score |
|---:|---|---|---|---:|
| 1 | IRON WING | Ari + Whitemon | Smokes / Wards / TFP | 100.0% |
| 2 | BoomBoys | Save + Kataomi | Smokes / Wards / TFP | 95.1% |
| 3 | Team Yandex | Saksa + Maladych | Camps / Wards / TFP | 95.0% |
| 4 | Aurora Gaming | Mira + kaori | Smokes / Wards / TFP | 95.0% |
| 5 | TEAM VISION | 9Class + Dukalis | Camps / Smokes / TFP | 92.5% |
| 6 | Team Spirit | not_me + rue | Camps / Wards / TFP | 92.0% |
| 7 | Team Falcons | Cr1t + Sneyking | Smokes / Wards / TFP | 91.2% |
| 8 | Team Liquid | Boxi + tOfu | Smokes / Wards / TFP | 90.8% |

Another broad 1,601-match guide ranked Thiolicor + KJ highly on averages. This
disagreement is methodological, not a typo: isolated means/tops do not fully model the
paired-role, shared-game, best-series scoring rules. Prefer the maintained helper,
which models those rules directly.

## Prefix fallback patterns

Do not choose a prefix globally from this list. Use it only to identify candidates for
the user's exact roster and strongest Emblems.

Examples from the title analysis:

- Falcons core often favored Golden or Otherworldly for Creep Score, GPM, Deaths, and
  TFP.
- Yandex core often favored Royal, with Golden or Otherworldly as secondary options.
- Spirit core often favored Elemental for TFP, GPM, Kills, and Deaths.
- bzm Mid often favored Cerulean across Runes, TFP, Creep Score, and GPM.
- Malr1ne Mid often favored Crimson across the same important stats.
- Mikoto Mid often favored Cerulean.
- Nisha Mid was more mixed: Cerulean, Otherworldly, and Elemental were all competitive.
- Cr1t + Sneyking support often favored Heroic.
- Ari + Whitemon support varied by stat, with Elemental strong for Wards/Smokes/TFP and
  Golden strong for Camps.
- Saksa + Maladych support varied among Cerulean, Emerald, Golden, and Heroic.

Because the Title is shared across all roles, a prefix that is individually best for
one role can still be inferior for the complete roster.

## Current-data override

Ignore any row in this file when:

- The team has been eliminated.
- A listed player is no longer on the tournament roster.
- The current period differs from the Group Stage assumptions.
- The user's exact Emblems cause another combination to rank higher in the helper.
- Recent games or a roster change materially alter the opportunity or data quality.
