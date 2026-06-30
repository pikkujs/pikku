---
"@pikku/cloudflare": patch
---

fix(cloudflare): register the global singleton-services slot in setupServices

The serverless worker entry (`createCloudflareHandler` → `WorkerEntrypoint.fetch`)
builds singleton services via `setupServices()`, but that function only cached
them in a module-local — it never called `setSingletonServices()`. The core
runners reached by `runFetch`/`runQueueJob`/`runScheduled` (`fetchData` et al.)
resolve services via the global `getSingletonServices()`, NOT the returned value,
so every function-bearing worker threw `Error: Singleton services not initialized`
on the first request — surfacing as a bare Cloudflare 1101 (HTTP 500) on every
`/api/*` route. `setupServices` now registers the global slot after creating the
services, matching what the standalone/server-target generated entries already do.
