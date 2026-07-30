---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/inspector': patch
---

Scenarios, features and steps no longer reach a deployment.

Steps were already held back from the app bootstrap, so a deployed server never imported a step body. Everything _about_ a scenario still travelled with the application: a `pikkuScenario(...)` is a function, so its name, schemas and hashes sat in the app function meta; the schemas it and its steps validate against sat in the app's `register.gen.ts` — on one project 458 of the 582 registered schemas belonged to tests; its name sat in the internal RPC meta; and because a scenario is _also_ a workflow, the inspector synthesised a `wf-orchestrator-<scenario>` queue worker for each one. The deploy analyzer, which reads inspector state rather than the partitioned codegen output, then read all of it back as application code: a unit per scenario, a `WorkflowDefinition` per scenario, and a real queue per scenario. A 13-scenario suite turned into 13 production queues named after tests, waiting for a provider to create them.

The existing scenario/app partition is now applied everywhere it was missing. `FunctionRuntimeMeta` gains a `scenario` marker (the counterpart of `scenarioStep`) so a scenario body is recognisable without walking the workflow graph; scenario bodies join their steps on the scenario side of the function-meta and registration split; schemas only a scenario or step needs are written and registered under `.pikku/scenarios/schemas/` and imported by the scenario bootstrap alone; scenario names are dropped from the internal RPC meta; no orchestrator queue worker is synthesised for a scenario; and the deploy analyzer drops both scenario functions and scenario workflows before it decides what a deployment contains.

Nothing changes for `pikku scenario run` — the scenario bootstrap still registers every scenario, feature, step, meta and schema. What changes is that a bundle stops carrying them.
