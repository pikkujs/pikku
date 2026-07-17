---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/gateway-slack': patch
---

Outgoing webhooks: `services.webhookService.send()` enqueues deliveries onto a `pikku-outgoing-webhooks` queue; a core worker POSTs the payload and throws on non-2xx so the queue retries with backoff (exponential by default). Per-call `retries`/`retryDelay`/`secret` overrides with defaults under `CoreConfig.webhook`; the config `secret` is a secret name resolved through the secret service and payloads are signed into `X-Pikku-Signature` (override the header via `CoreConfig.webhook.signatureHeader`). `WebhookService` is an abstract class owning the HMAC sign/verify, so an app can substitute its own delivery. `QueueWebhookService` takes its queue as a constructor dependency, so wiring webhooks up without a queue is a type error rather than a runtime throw. Enable via `pikku enable webhook` or `scaffold.webhook: true` in pikku.config.json.

Also fixes: the inspector now registers function metadata for a `func` inlined into `wireQueueWorker` — previously only the context-based `queue:<name>` id existed, so the worker failed at runtime with "Missing generated metadata for queue worker" — and preserves `sessionless` from the helper the function was built with; and the bootstrap missing the schemas `register.gen.ts` import when the project's only schemas come from late-generated scaffolds.
