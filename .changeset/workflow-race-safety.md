---
'@pikku/core': patch
'@pikku/addon-kysely': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
'@pikku/cloudflare': patch
'@pikku/skills': patch
---

Workflow races between a cancel, a running pass and a redelivered job are closed.

- A compensation no longer runs twice when `cancelRun` and the pass of an inline run both unwind it. A run unwinds only under its run lease; while a pass holds the lease, `cancelRun` returns and that pass unwinds.
- Run and step statuses are written by compare-and-set, so a late writer no longer turns a cancelled run into `completed`, `failed` or `suspended`, or changes a settled step. A refused step outcome throws `WorkflowStepSupersededError`.
- A claim leaves a step with a `cancelled` or unknown status alone. A lost forward step of a cancelled or unwinding run is failed instead of run again.
- A step is set running before the run is read, so a cancel landing in between stops it, including a closure step.
- A child workflow is linked to its parent step before it starts, so cancelling the parent cannot miss it.
- A failed closure step spends a retry when replayed, instead of running again for free.
- MongoDB workflow collections use primary reads and majority writes.

A custom workflow store has a changed contract: see `docs/MIGRATION.md`.
