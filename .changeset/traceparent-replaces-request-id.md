---
'@pikku/core': patch
'@pikku/cloudflare': patch
'@pikku/lambda': patch
'@pikku/azure-functions': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
'@pikku/skills': patch
---

Trace with W3C `traceparent`, and remove `x-request-id`

`wire.traceId` on an HTTP request is now 32 lowercase hex and `wire.trace` adds its span id, parent span and sampled flag. Mesh and remote addon calls send `traceparent`; `x-request-id` is no longer read or sent, `CF-Ray` no longer sets the trace, and `generateRequestId` is gone.

Public HTTP ignores an inbound `traceparent` unless `trustInboundTraceparent` is set. `pikkuMeshAuthMiddleware` continues a caller's trace once its token has verified. Breaking: see docs/MIGRATION.md.
