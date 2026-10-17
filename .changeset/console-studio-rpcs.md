---
'@pikku/addon-console': patch
'@pikku/core': patch
'@pikku/kysely': patch
---

Console RPCs for Pikku Studio's migrated screens: `console:variableGet` / `console:variableSet` read and write a project variable, gated on `pikku:console:variables:read` / `:write`.

`console:listIncomingWebhookReceipts` / `console:getIncomingWebhookReceipt` expose received webhooks, backed by a new `IncomingWebhookService.getReceipt(receiptId)` (null by default; implemented by `KyselyIncomingWebhookService`).
