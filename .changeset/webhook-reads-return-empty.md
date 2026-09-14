---
'@pikku/core': patch
---

Reading webhook deliveries no longer throws when nothing persists them.

`WebhookService.listDeliveries` and `getDelivery` return `[]`/`null` instead of `NotImplementedError`, so the console's webhooks page shows an empty list on an app whose service only delivers. `recordAttempt` still throws — a write that goes nowhere loses the caller's data.
