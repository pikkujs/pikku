---
'@pikku/core': patch
'@pikku/cli': patch
---

`pikku scenario run <env> --run browser --strict` now refuses every route off the run surface, rather than only reporting one at the end. An action step that would fall back to its `default` binding throws `ScenarioNoSurfaceBinding` even when it declares `default`, and a `then` witnessed only server-side throws the new `ScenarioUnwitnessedAssertion`. Without `--strict` nothing changes: the fallback still runs and the unwitnessed assertion is still counted into the coverage line.

It exists because a run is becoming a source of documentation. A docs build runs the suite `--run browser --strict`, so a feature that cannot be driven end to end through the UI cannot produce a page — no flow where three steps are screenshots and the fourth quietly happened over RPC with nothing to show. The refusal names the step, the surface the run asked for and the surfaces that did bind it, which turns "what still has no browser binding" into a worklist the run prints rather than something to go looking for.

`--strict` on `--run default` is accepted and does nothing, since nothing on the default surface can fall back or be witnessed elsewhere. `PikkuScenarioService.setRunSurface` takes the flag as a second argument, and `isStrictSurface()` reads it back.
