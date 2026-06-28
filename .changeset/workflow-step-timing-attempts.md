---
'@pikku/kysely': patch
'@pikku/core': patch
---

feat(workflow): expose per-step attempt count + record running/succeeded/failed timestamps

`getRunStatus` now returns `attempts` (the latest attempt count) per step, so
consumers can show retry counts without a second history query. It already
computed `duration` from `runningAt`/`succeededAt`, but the kysely workflow
store only stamped those timestamps on the *insert* path — the `running` /
`succeeded` / `failed` status transitions updated the history row's status
without setting `runningAt` / `succeededAt` / `failedAt`, so `duration` was
always undefined. The transitions now stamp the matching timestamp, so step
duration is populated for kysely-backed runs.
