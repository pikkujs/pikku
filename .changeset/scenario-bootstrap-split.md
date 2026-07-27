---
'@pikku/core': patch
'@pikku/cli': patch
---

Generate scenarios, features and scenario steps into `.pikku/scenarios/` with their own bootstrap, so a deployed server never imports a step body.

A `pikkuScenarioStep` body is an ordinary pikku function and a `pikkuScenario` is an ordinary workflow, so codegen wired both into `pikku-functions.gen.ts` and `pikku-workflow-wirings.gen.ts` — the files every server's bootstrap imports. A project's steps, and whatever a step imports (Playwright, fixtures, assertion helpers), therefore shipped in production. The e2e project's app bootstrap pulled in 20 step modules and 7 scenarios this way.

Codegen now partitions on the flags that already existed — `scenarioStep: true` in function meta and `source: 'scenario'` in workflow meta — and emits:

```
.pikku/scenarios/pikku-scenario-functions.gen.ts       addFunction for every step
.pikku/scenarios/pikku-scenario-functions-meta.gen.ts  step meta, merged onto the app's
.pikku/scenarios/pikku-scenario-wirings.gen.ts         addWorkflow + addFeature
.pikku/scenarios/pikku-scenario-wirings-meta.gen.ts    scenario meta, merged onto the app's
.pikku/scenarios/meta/*.gen.json                       per-scenario graph meta
.pikku/pikku-bootstrap-scenarios.gen.ts                imports the app bootstrap, then the above
```

`pikku scenario run` is the only thing that loads `pikku-bootstrap-scenarios.gen.ts`; `pikku dev` and `pikku serve` keep loading `pikku-bootstrap.gen.ts`. Bundling the e2e app bootstrap now resolves **zero** scenario or step modules.

Both meta files *merge* rather than replace — `pikkuState(…, 'meta', value)` is a wholesale setter — and each imports the app meta file it merges onto, so the ordering holds regardless of entry point. Features move wholesale to the scenario side: `serializeWorkflowRegistration` no longer emits `addFeature` at all.

`LocalMetaService` reads the new locations alongside the old ones (`scenarios/meta` in `getWorkflowMeta()`, `pikku-scenario-functions-meta.gen.json` in `getFunctionsMeta()`), so the console's scenario list and function meta are unchanged — those read from disk, not from the bundle. Scenario meta left behind in `workflow/meta` by an earlier CLI is removed on the next codegen, so it cannot be served as a stale duplicate.

**Not included:** a scenario step's input/output JSON schemas still register in the app's `schemas/register.gen.ts`. They are inert data rather than a module edge, and splitting them safely means deriving "required only by a step" across every other schema consumer — a wrong answer there unregisters a schema the server validates against.
