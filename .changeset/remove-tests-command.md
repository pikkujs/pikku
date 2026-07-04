---
'@pikku/cli': patch
'@pikku/cucumber': patch
'@pikku/console': patch
'@pikku/addon-console': patch
---

Remove the `pikku tests` harness in favour of scenarios (`pikku scenario run` + `pikku dev --coverage`).

- `@pikku/cli`: `pikku tests init` / `pikku tests coverage` are gone, along with the workspace-validate hints that suggested scaffolding the ftest harness.
- `@pikku/cucumber`: refactored to e2e-only — keeps `Actor`, the browser world, `createDbUtils`, `PersonaData`, and the `StubTracker` re-export; the in-process function world (`createFunctionWorld`, `registerHooks`, `registerCommonSteps`, stub wires) is removed.
- `@pikku/console`: the Tests page is removed; Scenarios moves to `/scenarios`.
- `@pikku/addon-console`: `runFunctionTests` / `streamFunctionTests` / `getFunctionCoverage` RPCs are removed — live coverage via `takeLiveCoverage` / `resetLiveCoverage` (from `pikku dev --coverage`) replaces the file-based report.
