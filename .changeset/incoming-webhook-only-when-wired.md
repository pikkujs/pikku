---
'@pikku/inspector': patch
'@pikku/inspector-go': patch
---

An app now requires `incomingWebhookService`, and the `incoming-webhook` schema it owns, only when it wires incoming webhooks (a webhook source or the `pikku-incoming-webhooks` queue worker). An addon that forwards the service, as `@pikku/addon-admin` does to list receipts, used to make every app that wired it require the service too: the generated local services then called `KyselyIncomingWebhookService.init()`, and an app whose migrations had no `webhook_receipt` table failed to boot over a table nothing writes to. Such an app now gets the queue-only service and the addon's receipt functions return an empty list. An app that does wire incoming webhooks still requires the service and still fails at boot when its tables are missing.
