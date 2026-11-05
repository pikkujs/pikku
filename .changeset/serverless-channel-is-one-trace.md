---
'@pikku/core': patch
'@pikku/cloudflare': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
---

A serverless channel is now one trace: `ChannelStore` keeps the connection's `traceparent`, and every frame and the disconnect continue it. The Kysely `channels` table gains a `traceparent` column.

Breaking: see `docs/MIGRATION.md`.
