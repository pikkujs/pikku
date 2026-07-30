---
'@pikku/cli': patch
'@pikku/inspector': patch
---

Scenario instrumentation is no longer scaffolded into projects, and no longer deploys.

`scaffold.scenarios` generated four functions — `pikkuScenarioTakeLiveCoverage`, `pikkuScenarioResetLiveCoverage`, `pikkuScenarioResetStubs`, `pikkuScenarioGetStubCalls` — into the project's own source. As project source they were indistinguishable from application code: registered in the app bootstrap, listed in the app's function and RPC meta, and shipped `expose: true` inside every deployed bundle. Coverage and stub inspection are things you do to a development server; production carried two endpoints that fingerprint the build and one that resets a global tracker, gated only by whether a metadata file happened to sit beside the bundle.

`pikku dev` now registers the implementations itself, after the app bootstrap. Nothing is generated, nothing is written to the project, and a bundle cannot carry what was never in its bootstrap — `pikku serve` and every deployed unit have no trace of them. The scenario runner reaches them over `/rpc/<name>` exactly as before.

Also:

- The inspector ignores these four names wherever it finds them, so a project that has not regenerated — and still has the scaffolded file checked in — stops deploying it immediately. Codegen deletes the retired scaffold on its next run.
- They no longer count towards a project's function total, so `pikku scenario --coverage` stops reporting four permanently-uncovered functions that were never the project's to cover.
- The instrumentation no longer carries schemas (there was nothing to validate but one optional string), which drops the `zod` dependency the scaffold silently required of every project that enabled it.
- They are registered sessionless, so `scaffold.scenarios: true` — as opposed to `'auth'` — now genuinely means "no session required". As a sessioned `pikkuFunc` with `auth: false`, it demanded a session anyway and logged a warning saying so.
