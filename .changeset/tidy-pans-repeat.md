---
'@pikku/kysely': patch
'@pikku/core': patch
---

`send()` now reports the delivery id it wrote, not only the broker's job id.

`KyselyWebhookService.send()` returned `{ jobId }` straight from `queueService.add()`, and callers handed that to `getDelivery()`. That only worked because every queue in the test suite echoed the requested `jobId` back. A broker is free to assign its own identity — the JetStream queue returns a stream sequence — so on those the read-back looked up an id that was never written and 404'd.

`SendWebhookResult` gains an optional `deliveryId`, which store-backed implementations always populate.
