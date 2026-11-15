---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/deploy-standalone': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/ws': patch
'@pikku/bun-server': patch
'@pikku/uws-handler': patch
'@pikku/cloudflare': patch
'@pikku/lambda': patch
'@pikku/kysely-postgres': patch
---

The event hub is publish-only and owned by the runtime. `services.eventHub` publishes; `pikkuSubscribeFunc` returns the topic a client may follow; the runtime attaches sockets and streams to the hub it created. See docs/MIGRATION.md.
