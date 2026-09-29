---
'@pikku/console': patch
'@pikku/addon-console': patch
---

The console shows webhook trigger sources. A trigger named `<source>:<event>` now pairs with its `wireTriggerWebhookSource` instead of reading as having nothing to listen to, and its row says which event it listens to and where it is received. Opening it shows the source's address, accepted request types, declared events, which lifecycle steps (receive, check, setup, teardown) it has, and whether its `<source>WebhookSecret` signing secret is saved, with a link to Credentials when it is not. `console:getAllMeta` now returns `webhookSourceMeta`.
