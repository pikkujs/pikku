---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

Webhook signing secrets live in the credential store. `WebhookSigningSecret.fromCredential(provider, credentialService, name)` reads the secret per delivery via `load()`, so a `setup` step (or a handshake) that stores a new one with `credentialService.set` takes effect without a deploy.

Breaking: `setup` no longer returns `secret`, `wireTriggerWebhookSource` no longer takes `secret`, lifecycle outcomes drop `secretName`/`secret`, and `pikku webhooks setup` drops `--secretsOut`.
