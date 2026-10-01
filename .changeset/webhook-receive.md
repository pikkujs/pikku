---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
---

Webhook `receive` steps lose their boilerplate. `pikkuWebhookReceive` (from `#pikku/trigger` or `#pikku/addon/trigger`) declares one: it is public, typed to the raw request, and never registered as an RPC, and the inspector rejects a `receive` declared with any other wrapper. `parseJson` (in `@pikku/core/utils`, generated as `#pikku/utils` and `#pikku/addon/utils`) parses text or bytes and answers a body that is not JSON with a 400. A webhook source whose `method` includes `'head'` now answers HEAD probes itself with a 200.
