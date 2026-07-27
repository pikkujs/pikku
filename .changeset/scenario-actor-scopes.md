---
'@pikku/core': patch
'@pikku/cli': patch
---

Let a scenario actor declare the scopes and roles it holds

`scenarios.actors.<name>` in `pikku.config.json` now takes optional `scopes` and
`roles`, carried through to `scenarioActorConfigs`. Pikku never applies them —
which scope store exists and which roles have been created is the app's own — so
the generated actors file also exports `scenarioActorList`, the registry widened
to `ScenarioActorConfig`, which is what a seed needs to read an optional field
off every actor.
