---
'@pikku/core': patch
'@pikku/cli': patch
---

Outgoing webhooks: `services.webhookService.send()` enqueues deliveries onto a `pikku-webhooks` queue; a core worker POSTs the payload and throws on non-2xx so the queue retries with backoff (exponential by default). Per-call `retries`/`retryDelay`/`secret` overrides with defaults under `CoreConfig.webhook`; the config `secret` is a secret name resolved through the secret service and payloads are signed into `X-Pikku-Signature`. Enable via `pikku enable webhook` or `scaffold.webhook` in pikku.config.json. Also fixes the bootstrap missing the schemas `register.gen.ts` import when the project's only schemas come from late-generated scaffolds.
