---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/kysely': patch
'@pikku/addon-console': patch
'@pikku/console': patch
'@pikku/gateway-slack': patch
---

Outgoing webhooks: `services.webhookService.send()` enqueues deliveries onto a `pikku-outgoing-webhooks` queue; a core worker POSTs the payload and throws on non-2xx so the queue retries with backoff (exponential by default). Per-call `retries`/`retryDelay`/`secret` overrides with defaults under `CoreConfig.webhook`; the config `secret` is a secret name resolved through the secret service and payloads are signed into `X-Pikku-Signature` (override the header via `CoreConfig.webhook.signatureHeader`). `WebhookService` is an abstract class owning the HMAC sign/verify, so an app can substitute its own delivery. `QueueWebhookService` takes its queue as a constructor dependency, so wiring webhooks up without a queue is a type error rather than a runtime throw. Enable via `pikku enable webhook` or `scaffold.webhook: true` in pikku.config.json.

Delivery persistence lives on the same `webhookService`: `WebhookService` gains `recordAttempt`/`listDeliveries`/`getDelivery` methods that throw `NotImplementedError` by default (the queue-only service keeps no history), and `@pikku/kysely`'s `KyselyWebhookService` (extends `QueueWebhookService`) overrides them — recording a `webhook_delivery` row per `send()` and one `webhook_delivery_attempt` row per try. The delivery id doubles as the queue `jobId` (idempotency) and rides in the payload, so the worker records every attempt against it (only ever set by the store-backed service, so the base throwing methods are never hit). Deliveries can be scoped with `send({ organizationId })`. The `@pikku/addon-console` addon exposes `listWebhookDeliveries`/`getWebhookDelivery` over `webhookService`, and `@pikku/console` gains a read-only `/webhooks` page (delivery list + a right-side attempt-history drawer).

`TypedSecretService` now caches resolved secrets in-process (invalidated on `setSecret`/`deleteSecret`, no TTL — see #964), so callers read naively without re-hitting the underlying secret service; the webhook signing path relies on this rather than caching itself.

Also fixes: the inspector now registers function metadata for a `func` inlined into `wireQueueWorker`, `wireScheduler`, `wireTrigger`, and `wireGateway` (shared `ensureInlineWiringFunction` helper). Previously only the context-based `queue:<name>`/`scheduler:<name>`/… id existed while the function itself was never registered, so the transport failed at runtime with "Missing generated metadata for ..." (and, once registered, every invocation would 403 because the stub carried no `sessionless` flag). The flag is now carried across from the helper the function was built with, matching how named functions are handled. Also fixes the bootstrap missing the schemas `register.gen.ts` import when the project's only schemas come from late-generated scaffolds.
