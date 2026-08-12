---
'@pikku/core': patch
'@pikku/cli': patch
---

fix(cli,core): make scenario captures reachable, filed per scenario, and findable

`--screenshots` and `--video` were read by `scenario run` but never declared as
options, so both flags were rejected as unknown and silently ignored — capture
could not be switched on from the command line at all.

A provider's `beginScenario` was never called, so every capture in a run was
filed under one shared label instead of the scenario that produced it. It is now
part of `ScenarioBrowserProvider` and called after the per-scenario reset, once
the previous scenario's context is closed and its video finalised.

The run also never said where it wrote anything. It now reports `Captures → …`
after the browser closes, which is the point at which a video exists.
