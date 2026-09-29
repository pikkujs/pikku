---
'@pikku/core': patch
'@pikku/cli': patch
---

`pikku dev` registers webhook sources with their providers when `PIKKU_DEV_WEBHOOK_URL` is set. What it registered, signing secrets included, is kept in a git-ignored `.webhook-registrations.gen.json` next to `pikku.config.json`, so a database reset or `.pikku` wipe does not register again, and nothing reaches a provider while the url and events are unchanged. Registrations no source declares any more are warned about on every run, with the endpoint and label to delete by hand. The prefix defaults to `dev-<username>`; override it with `PIKKU_DEV_WEBHOOK_LABEL_PREFIX`. New in core: `reconcileWebhookRegistrations`.
