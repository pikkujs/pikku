---
'@pikku/core': patch
'@pikku/kysely': patch
---

Add `relayUndispatchedSteps()`, which re-drives steps whose queue or scheduler
dispatch was lost.

Arming a step is two writes to two systems — the step row lands `pending`, then
a job is published — and nothing spans both, so a crash in between leaves a
durable row nothing will ever pick up. The run then neither finishes nor fails.

The step row is the outbox record and this is the relay. It is safe to
re-dispatch a step that already has a live job because `executeWorkflowStepInner`
claims the step under `withStepLock` before invoking anything: the loser reads
`running` and returns. Stores opt in by overriding `findUndispatchedSteps`
(implemented for Kysely and in-memory); the default returns nothing, so a store
without an atomic step lock gains no re-dispatches.

Not self-starting — call it from a scheduled task.
