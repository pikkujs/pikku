---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
---

Add `defineOutgoingWebhook({ event, title, description?, payload })` in `@pikku/core/webhook`. The CLI collects every exported declaration into `.pikku/webhooks/pikku-outgoing-webhooks-meta.gen.json` and `pikku-outgoing-webhooks.gen.ts`, which exports `OutgoingWebhooksMap`, `TypedWebhookService` and `typedWebhookService(service)`: `send` checks `data` against the declared payload for a declared event and accepts any other event unchanged. `MetaService.getOutgoingWebhooksMeta()` and the console addon's `outgoingWebhooksMeta` serve the declarations.
