---
'@pikku/core': patch
'@pikku/kysely': patch
---

Recover workflow runs stalled by a crash mid-dispatch.

Arming a step is two writes to two systems — the step row, then the queue or
scheduler job — so a process that died between them left a run `running` with
nothing in flight. It parked on a step that would never complete and never
error, so the run neither finished nor failed, and nothing swept it up.

`workflowService.recoverStalledRuns()` re-drives those runs through
`resumeWorkflow`. Replay is memoized per step, so resuming a run that was not
actually stuck changes nothing; runs mid-sleep or with a step in flight are
excluded outright. It is not self-starting — call it from a scheduled task.

Stores opt in by overriding `findStalledRunIds`; implemented here for the
Kysely and in-memory services, and a no-op elsewhere.
