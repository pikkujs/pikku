---
type: question
title: Should HTTP persona sessions reset between scenarios in one CLI run?
description: The CLI builds HTTP personas once and reuses them for every scenario, and only the browser side is reset between scenarios
tags: core, cli, scenario, personas
---

# Should HTTP persona sessions reset between scenarios in one CLI run?

In `packages/cli/src/functions/commands/scenario.ts`, `createHttpPersonas` runs
once (around line 311), and that same `actors` object is passed to every
`workflowService.startWorkflow` call for each scenario (around line 742). Each
`HttpPersona` holds its own cookie jar and its `signedIn` flag for the life of
the process.

Before each scenario the command calls `browserLifecycle.reset()` (around line
715), which discards the browser's per-scenario state. Nothing resets the HTTP
jars: `scenario.ts` never calls `clear` or `signOut`, and
`PikkuScenarioService.detachRunContext` (`packages/core/src/wirings/workflow/pikku-scenario-service.ts`)
drops the run's map entry but not the jars inside the shared object.

So an HTTP persona that signed in during one scenario is still signed in for the
next, unless a 401 forces a re-login. The browser side is reset specifically "so
one scenario cannot leave the next signed in as somebody else", as
[Scenario sessions are isolated per actor and reset between scenarios](../decisions/security/workflow-scenario-sessions-are-isolated-per-actor-and-per-scenario.md)
records. What is asked: is the HTTP side meant to carry sessions across scenarios
as a speed measure, or should it be reset the same way?
