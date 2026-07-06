---
'@pikku/console': patch
---

Scenarios no longer route into the workflow-run UI. The Scenarios list now
navigates to its own `scenarios` section (a new `scenarioId` on the console
navigator) and renders a read-only detail — scenarios can only be run via
`pikku scenario run` (actor sign-in cookies can't be minted in the browser),
so the workflow "run" button (which calls `startWorkflow` with no actors and
throws "needs run actors") is never mounted for a scenario.
