---
'@pikku/core': patch
---

fix(queue): `InMemoryQueueService` redelivers failed jobs up to `options.attempts` with backoff

Previously the in-memory queue ran each job once and dropped it on failure, so a
transiently-failing workflow step dispatched via `inline: false` would stall the
run forever (the orchestrator was never resumed). It now honors the `attempts`
and `backoff` already produced by the workflow step job options, redelivering on
failure — matching pg-boss/bullmq semantics so local/dev runs recover from
transient step failures exactly as production does.
