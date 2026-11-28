---
'@pikku/core': patch
'@pikku/kysely': patch
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
- A recovery sweep recording an inline child's outcome before the parent's pass no longer fails the parent and compensates a child that succeeded.
- A pass whose `cancelled` write is refused tells the parent only if the run did end `cancelled`.
- An unwind driver that throws no longer drops a caller that arrived while it ran.
- A run whose `onRunCreated` throws, such as a child that cannot be linked, is failed before it starts.
- Redis gives a retry claimed as `running` a fresh lease in the same write, so a redelivery cannot run it a second time.

A custom workflow store has a changed contract: see `docs/MIGRATION.md`.
