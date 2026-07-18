---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/kysely': patch
'@pikku/addon-console': patch
'@pikku/console': patch
'@pikku/gateway-slack': patch
---

Add outgoing webhooks — `webhookService.send()` enqueues signed deliveries onto a retrying queue, `@pikku/kysely`'s `KyselyWebhookService` persists per-attempt delivery history, and `@pikku/console` gains a read-only `/webhooks` page; also caches resolved secrets in `TypedSecretService` and registers inline-`func` metadata for queue/scheduler/trigger/gateway wirings.
