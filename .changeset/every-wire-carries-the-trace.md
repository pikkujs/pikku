---
'@pikku/core': patch
'@pikku/cloudflare': patch
'@pikku/kysely': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Trace every wire

Channels, agent tools and tool workflows, MCP, CLI, triggers, webhook sources, gateways and Cloudflare `runRpc` now carry `traceparent`. A wire with no trace becomes the root of one, and `scheduleRPC` and `webhookService.send` called from a function are stamped with its trace.

Channel RPC frames take `traceparent` instead of `traceId`, and a responder ignores it unless `trustInboundTraceparent` is set. See `docs/MIGRATION.md`.
