---
type: question
title: Should HTTP virtual user sessions reset between scenarios in one CLI run?
description: The CLI builds HTTP virtual users once and reuses them for every scenario, and only the browser side is reset between scenarios
tags: core, cli, scenario, virtual-users
---

# Should HTTP virtual user sessions reset between scenarios in one CLI run?

In `packages/cli/src/functions/commands/scenario.ts`, `createHttpVirtualUsers`
runs once (around line 314), and that same `virtualUsers` object is passed to
every `workflowService.startWorkflow` call for each scenario (around line 745).
Each `HttpVirtualUser` holds its own cookie jar and its `signedIn` flag for the
life of the process.

Before each scenario the command calls `browserLifecycle.reset()` (around line
723), which discards the browser's per-scenario state. Nothing resets the HTTP
jars: `scenario.ts` never calls `clear` or `signOut`, and
`PikkuScenarioService.detachRunContext` (`packages/core/src/wirings/workflow/pikku-scenario-service.ts`)
drops the run's map entry but not the jars inside the shared object.

So an HTTP virtual user that signed in during one scenario is still signed in for
the next, unless a 401 forces a re-login. The browser side is reset to keep one
scenario from leaving the next signed in as somebody else, as
[Scenario sessions are isolated per virtual user and reset between scenarios](../decisions/security/workflow-scenario-sessions-are-isolated-per-virtual-user-and-per-scenario.md)
records. What is asked: is the HTTP side meant to carry sessions across scenarios
as a speed measure, or should it be reset the same way?
