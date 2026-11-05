---
'@pikku/core': patch
'@pikku/cloudflare': patch
'@pikku/lambda': patch
'@pikku/azure-functions': patch
'@pikku/aws-services': patch
'@pikku/queue-bullmq': patch
'@pikku/queue-pg-boss': patch
'@pikku/queue-nats': patch
'@pikku/schedule': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Keep one trace through jobs, scheduled tasks and workflow runs

A function's `queueService.add` stamps the caller's `traceparent` on the job, and a workflow run stores its trace on `run.wire.traceparent`, so every step, retry, sleep, resume, child workflow and recovery stays on it. Every queue adapter carries `traceparent`, and queue and scheduler wires always have `wire.trace`.

The `q-<id>` and `cron-<id>` trace ids are gone. `runQueueJob` no longer takes `traceId`, and remote job bodies take `traceparent`. Breaking: see docs/MIGRATION.md.
