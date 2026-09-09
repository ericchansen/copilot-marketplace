# Vendored helper model

The following source files are copied without code changes from
[`VirenDias/ti15-fantasy`](https://github.com/VirenDias/ti15-fantasy) commit
`fff2663466b70cc8810d02cdbf495523098784e7`:

- [`docs/calc.js`](https://github.com/VirenDias/ti15-fantasy/blob/fff2663466b70cc8810d02cdbf495523098784e7/docs/calc.js)
- [`docs/rolls.js`](https://github.com/VirenDias/ti15-fantasy/blob/fff2663466b70cc8810d02cdbf495523098784e7/docs/rolls.js)

They are distributed under the
[upstream MIT license](https://github.com/VirenDias/ti15-fantasy/blob/fff2663466b70cc8810d02cdbf495523098784e7/LICENSE),
preserved in `LICENSE` with Viren Dias's copyright notice. The imported files use
LF line endings and match the pinned upstream bytes. The original advisor and its
packaging use the separate MIT license at the skill root.

## Match data is not included

The upstream [license clarification](https://github.com/VirenDias/ti15-fantasy/blob/fff2663466b70cc8810d02cdbf495523098784e7/readme.md#licence)
explicitly excludes match data derived from OpenDota and Valve replays from MIT,
along with the replay parser JAR and Valve's hero file. None of those assets is
redistributed here. In particular, `docs/data.json` is NOT an MIT dependency and
the personal skill's local copy has intentionally not been imported.

The analyzer accepts a separately obtained compatible dataset via `--data`.
Acquiring or redistributing that data requires its own terms/permission; public
availability is not a license grant. See `..\README.md` for setup.

`..\examples\synthetic-model.json` combines fictional match rows with the engine's
published rule labels/structure. It is a small, explicitly marked MIT test
fixture, not historical player data or a replacement dataset for recommendations.
