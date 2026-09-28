---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/kysely': patch
---

Add `wireTriggerWebhookSource({ name, method?, route?, secret?, events, receive?, check?, setup?, teardown? })` in `#pikku/trigger`. Each source becomes a `POST /webhooks/<name>` route whose events are validated against their schemas and queued on `pikku-incoming-webhooks` through `IncomingWebhookService`; a generated worker runs the matching `wireTrigger({ name: '<source>:<event>' })` and the queue retries it on failure. `pikku webhooks status | setup | teardown --url --labelPrefix [--previous]` registers the routes with the provider and prints one JSON line per source.

`KyselyIncomingWebhookService` (with the `incoming-webhook` schema) records a receipt per event, drops a provider's redelivery of an event it already accepted, and keeps each dispatch's attempts and last error. `pikku dev` and `pikku serve` use it when a Kysely database is configured.
