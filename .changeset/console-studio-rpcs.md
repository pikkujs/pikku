---
'@pikku/addon-console': patch
'@pikku/addon-admin': patch
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/schedule': patch
'@pikku/queue-bullmq': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

RPCs for Pikku Studio's migrated screens. Runtime state that must be visible on a deployed app lives in `@pikku/addon-admin`; local-copy tools stay in `@pikku/addon-console`.

`@pikku/addon-admin`:

- `admin:getSchedulerHistory` returns each scheduled task's last run, next run and recent runs, from a new `SchedulerService.getTaskRuns()` (empty by default). `InMemorySchedulerService` records the last 50 runs per cron task with status, duration and error. Scope `admin:schedules:read`.
- `admin:getQueueHistory({ queueNames?, limit? })` returns live counts and recent jobs per queue, from a new optional `QueueService.inspect(queueName, { limit })`, implemented by `InMemoryQueueService` and `BullQueueService` and forwarded by `SignedQueueService`. Scope `admin:queues:read`.
- `admin:listIncomingWebhookReceipts` / `admin:getIncomingWebhookReceipt` expose received webhooks, backed by a new `IncomingWebhookService.getReceipt(receiptId)` (null by default; implemented by `KyselyIncomingWebhookService`). Scope `admin:webhooks:read`.

`@pikku/addon-console`:

- `console:variableGet` / `console:variableSet` read and write a project variable, gated on `pikku:console:variables:read` / `:write`.
- `console:runScenarios({ names?, environment? })` starts `pikku scenario run` as a detached child process and returns `{ runId }` to follow through `listScenarioRuns` / `getScenarioRun`, gated on the new `pikku:console:scenarios:run` scope. `pikku scenario run` takes `--run-id <id>` to record under a caller-chosen id.
