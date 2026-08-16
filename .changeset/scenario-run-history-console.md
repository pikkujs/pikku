---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/console': patch
---

Scenario runs are now kept, and the console reads them back.

Every `pikku scenario run` files a record: the run's outcome and counts, each
scenario's result with the prose of the steps as they read at the time, and the
screenshots and video it left behind. The steps are snapshotted rather than
referenced, so a run still reads correctly after the scenario that produced it
has been rewritten.

`ScenarioRunStore` is the interface, `FileScenarioRunStore` the on-disk
implementation the CLI writes to — one folder per run, `run.json` beside its
artifacts, under `<outDir>/scenario-runs`. It is a store in its own right rather
than a corner of the workflow service, so a hosted console can keep the same
records in a database and its footage in object storage without the functions
that read them knowing the difference.

The console's Scenarios page gained a Runs view (`?view=runs`) listing past
runs, with a run's results, its step ladder, failures, and the screenshots and
video inline. Reading and deleting runs are gated by the new
`pikku:console:scenarios:read` and `pikku:console:scenarios:manage` scopes.
