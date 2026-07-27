---
'@pikku/cli': patch
---

Stop `pikku scenario run --tags` from narrowing the project it is about to run.

`--tags` selects which scenarios to run, but it was also being read as the
inspector's tag filter, which selects which code to generate. A run tagged
`console` therefore lost every step function that was not itself tagged
`console`, so no browser steps were found, no browser provider registered, and
every browser scenario failed. `getInspectorState` gains an `unfiltered`
argument for commands that run the project rather than generate from it, and
`scenario list` / `scenario run` pass it.
