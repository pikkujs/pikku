---
'@pikku/core': minor
'@pikku/inspector': minor
'@pikku/cli': minor
'@pikku/addon-console': minor
'@pikku/console': minor
---

Add `defineWebhook({ event, title, description?, payload })` in `@pikku/core/webhook`. The CLI collects every exported declaration into `.pikku/webhooks/pikku-webhooks-meta.gen.json` and `pikku-webhooks.gen.ts`, which exports `WebhooksMap`, `TypedWebhookService` and `typedWebhookService(service)`: `send` checks `data` against the declared payload for a declared event and accepts any other event unchanged. `MetaService.getWebhooksMeta()` and the console's `webhooksMeta` serve the declarations, and the console Webhooks page lists every declared event, including ones not sent yet, with sends joined by event and undeclared sends under "Other".
