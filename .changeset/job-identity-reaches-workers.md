---
'@pikku/core': patch
'@pikku/cloudflare': patch
'@pikku/lambda': patch
'@pikku/azure-functions': patch
'@pikku/aws-services': patch
'@pikku/queue-bullmq': patch
'@pikku/queue-pg-boss': patch
'@pikku/cli': patch
---

A job signed by `SignedQueueService` now runs as its user on every queue adapter, where BullMQ, pg-boss and SQS dropped the claim and the Azure and Cloudflare consumers ignored it. Graph child runs and Cloudflare step workers keep the run's user. An unsigned or forged claim is still dropped.

`SQSQueueService` from `@pikku/lambda` now sends the job's data as the body, so workers stop receiving the wrapper object. Generated remote job schemas keep `traceparent`, which they were stripping, and `pikkuUserId`. `defineQueueIdentityTransportTests` in `@pikku/core/testing` holds an adapter to all of this.

Breaking: see `docs/MIGRATION.md`.
