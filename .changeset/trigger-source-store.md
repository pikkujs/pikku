---
'@pikku/core': minor
'@pikku/kysely': minor
'@pikku/addon-admin': minor
'@pikku/better-auth': minor
---

Trigger sources are enabled at runtime. `TriggerSourceStore` (in-memory and `KyselyTriggerSourceStore` on `pikku_trigger_source`) records which sources an operator enabled and what setup registered; `syncTriggerSources` and `setWebhookSourceEnabled` run the sync and the setup/teardown in the app, and the admin addon exposes list, enable/disable, sync and prune under the new `admin:triggers` scopes.
