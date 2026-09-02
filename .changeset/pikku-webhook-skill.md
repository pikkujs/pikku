---
'@pikku/skills': patch
---

Add a `pikku-webhook` skill covering the outgoing webhook primitive — `WebhookService` / `QueueWebhookService`, the `pikku-outgoing-webhooks` queue worker, `scaffold.webhook`, `config.webhook` (signing secret, header, retries, SSRF allowlist), receiver-side verification, and `KyselyWebhookService`'s delivery/attempt history. The corpus previously mentioned it in one table row, so agents hand-rolled `fetch` + HMAC instead of using it.
