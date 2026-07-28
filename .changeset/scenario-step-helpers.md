---
'@pikku/core': patch
---

Settle what a scenario step imports from `@pikku/core/workflow`.

Core carries what the scenario runtime contract needs — the step wire, the browser-driver interface, the transport's response shape — and what core itself implements. Two helpers that had been promoted alongside them are neither, and are not exported: `describeValue`, a one-line formatter for an assertion message, and `readScenarioSseEvents`, a general SSE reader with a scenario-flavoured name. Both are a test suite's own vocabulary, with no consumer inside the framework; a project that wants them owns them, at three and twenty lines. Neither shipped, so nothing to migrate.

What stays, and why:

- `requireActor(scenarioStep)` / `requireScenarioEnv(scenarioStep)` — narrow the optional halves of the step wire, naming the step and what to pass.
- `pollUntil(attempt, { timeoutMs, intervalMs })` — retries until `attempt` answers anything but `undefined`, then answers with it. Reaching the deadline answers `undefined` rather than throwing, because only the caller knows what was being waited for and can say so. `@pikku/playwright` waits on it too.
- `createCookieJar` and `readScenarioHttpResponse` / `postScenarioJson` — `HttpScenarioActor` is built on all three, so a step producing the same record reaches the same function.
- The browser-driver interface, and the reporter's `composeStepProse` / `renderStepTemplate`.

The export list is now grouped by who imports it — writing a step, driving a browser, reporting a run — rather than by the order the exports were added.
