---
'@pikku/addon-console': patch
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/schedule': patch
---

Console RPCs for Pikku Studio's migrated screens: `console:variableGet` / `console:variableSet` read and write a project variable, gated on `pikku:console:variables:read` / `:write`.

`console:listIncomingWebhookReceipts` / `console:getIncomingWebhookReceipt` expose received webhooks, backed by a new `IncomingWebhookService.getReceipt(receiptId)` (null by default; implemented by `KyselyIncomingWebhookService`).

`console:getSchedulerHistory` returns each scheduled task's last run, next run and recent runs, from a new `SchedulerService.getTaskRuns()` (empty by default). `InMemorySchedulerService` records the last 50 runs per cron task with status, duration and error.
