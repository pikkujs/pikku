---
'@pikku/core': patch
'@pikku/cli': patch
---

Scenario context: scenarios now receive a `scenario` wire (was `workflow`) with the scenario-only helpers `expectEventually`/`expectError`/`expectService` plus a new `scenario.runScheduledTask(name)` that fires a cron inline with the system session. `PikkuWorkflowWire` is trimmed to the plain DSL (`do`/`sleep`/`suspend`); the scenario surface lives on the new `PikkuScenarioWire`. Actor calls (`invoke`/`converse`) stay on the `actors` registry. Scenarios are now excluded from `pikku scenario --coverage` totals.
