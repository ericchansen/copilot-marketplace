# Sources and evidence hierarchy

Use sources in this order:

1. [Liquipedia TI 2026 API](https://liquipedia.net/dota2/api.php?action=parse&page=The_International/2026&prop=wikitext&section=1&format=json)
   and the [official Dota 2 esports page](https://www.dota2.com/esports/ti15) for current
   tournament format, results, eliminations, and substitutions. Liquipedia may require
   a descriptive User-Agent when accessed with `curl`.
2. [TI 2026 Fantasy Helper](https://virendias.github.io/ti15-fantasy/) for the current
   calculator, compiled data, and methodology.
3. [Fantasy Helper source and methodology](https://github.com/VirenDias/ti15-fantasy)
   for exact mechanics, assumptions, quality estimates, and implementation details.
4. [The International 2026 Fantasy Helper: Group Stage](https://www.reddit.com/r/DotA2/comments/1vit47o/the_international_2026_fantasy_helper_group_stage/)
   for the author's rationale and paired-role/variance corrections.
5. [TI 2026 Fantasy: Emblem-Player Combinations](https://www.reddit.com/r/DotA2/comments/1veps0k/ti_2026_fantasy_a_datadriven_look_at_emblemplayer/)
   for P90 alternatives, exchange rates, and player-specific combinations.
6. [TI 2026 Fantasy: Titles](https://www.reddit.com/r/DotA2/comments/1vkdlnd/ti_2026_fantasy_a_datadriven_look_at_titles/)
   for player/Emblem-specific prefix expected values and suffix framing.
7. [Fantasy League 2026 Guide](https://www.reddit.com/r/DotA2/comments/1vble84/fantasy_league_2026_guide/)
   for broad stat tiers, quality/trait guidance, and accessible baseline advice.

## Reconciliation rules

- Prefer the helper over isolated averages because it models player pairs, shared games,
  the top two games in a series, and the best series in the period.
- Prefer current helper data over static Reddit tables.
- Use the broad guide as a fallback tier list, not an exact calculator.
- Use the P90 study for robust alternatives and directional exchange rates, while
  acknowledging that P90 does not model every series path.
- Treat Reddit comments as clarification only when they explain mechanics or published
  methodology; do not use popularity or anecdotal outcomes as evidence.
- For current eliminations, substitutions, schedules, or bracket state, verify against
  a live tournament source before recommending players.
