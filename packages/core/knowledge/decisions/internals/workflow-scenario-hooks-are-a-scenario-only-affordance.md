---
type: decision
title: Scenario lifecycle hooks are a scenario-only affordance and never mask the failure they follow
description: A durable workflow replays, so a callback that reruns each replay has no honest meaning there
tags: workflow
---

# Scenario lifecycle hooks are a scenario-only affordance and never mask the failure they follow

`PikkuScenarioService.scenarioHooks` (`pikku-scenario-service.ts`) returns hooks
only when `workflowMeta.source === 'scenario'`. A plain workflow is durable and
resumable, so a `before`/`after` callback that reran on every replay would have
no honest meaning — hooks exist for scenarios because a scenario run is a single
pass by a single external process.

A hook is not a pikku function: it has no id, no meta and no schema, so it
cannot go through `runPikkuFunc` and the runner records nothing for it. It gets
exactly what the scenario body gets — the same wire (which is how it reaches the
app through `actors`) and singleton services composed with this invocation's
wire services — and nothing else. `ScenarioHookError` keeps the original error
as `cause`, so the failure that actually happened is never lost behind the label
saying which phase it happened in.

`onAfterRunFunc` returns early on the `interrupted` outcome, because the run is
suspended or waiting and teardown would fire mid-flight. When the scenario has
already failed for its own reason, an `after`-hook failure is attached as
`cause` and logged rather than replacing the headline; only a teardown failure
after a _passing_ scenario fails the run.

At the feature level (`workflow.types.ts`, `CoreFeature`), hooks run once around
the whole group — `before → a → b → c → after` — not per scenario. That is the
one thing a feature deliberately cannot express: gherkin's `Background:` runs
per scenario, and per-scenario setup is the scenario's own `before`.

`setScenarioEnvironment` on the same service is per-service, not per-run, for a
related reason: a runner process targets exactly one environment for every
scenario it executes, so threading it through each run would only create ways
for two runs in one process to disagree.

**What this rules out:** offering hooks on plain workflows, routing a hook
through `runPikkuFunc` so it gets recorded as a step, running `after` on an
interrupted run, letting a teardown failure overwrite the scenario's own
failure, or reinterpreting feature hooks as per-scenario `Background:`.
