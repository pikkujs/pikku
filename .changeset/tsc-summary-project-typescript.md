---
'@pikku/cli': patch
---

fix `pikku all --tsc`/`--tsc-summary` reporting phantom type errors

The type-check used the CLI's own bundled TypeScript, which could be a different major than the project's (e.g. TS 6 vs a project on TS 5) and emit diagnostics the project's real `tsc` never would — most visibly 10 phantom `TS2591 Cannot find name 'process'` errors on a project that type-checks clean under its own compiler. `runProjectTypecheck` now loads the project's own installed `typescript` (falling back to the bundled one only when the project has none).
