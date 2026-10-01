---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
---

Webhook `receive` steps lose their boilerplate. `pikkuWebhookReceive` (from `#pikku/trigger` or `#pikku/addon/trigger`) declares one: it is public, typed to the raw request with a required `http`, and never registered as an RPC, and the inspector rejects a `receive` declared with any other wrapper. `parseJson` (in `@pikku/core/utils`, generated as `#pikku/utils` and `#pikku/addon/utils`) parses text or bytes and answers a body that is not JSON with a 400. A webhook source whose `method` includes `'head'` answers HEAD probes itself with a 200.

`receive` no longer returns `{ respond }`: a handshake returns nothing and writes its answer to `http.response`, like any other HTTP function. The webhook route no longer returns a fetch `Response` either. An HTTP function that returns nothing is now answered with whatever status its response has (200 unless it set another), no longer a forced 204. A webhook receive is also left out of contract versioning, since nothing but its own route calls it.
