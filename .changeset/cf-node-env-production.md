---
'@pikku/deploy-cloudflare': patch
'@pikku/core': patch
---

A deployed Cloudflare Worker is always production. The adapter now pins `process.env.NODE_ENV` to `"production"` in the bundle, and core's `isProduction()` reads the literal `process.env.NODE_ENV` so that pin takes effect. Before, a Worker had no `NODE_ENV`, so `isProduction()` was false and every 5xx response returned the error message and stack trace to the client. `process.env.NODE_ENV` now wins over a variables service when it is set.
