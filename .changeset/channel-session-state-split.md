---
'@pikku/core': patch
'@pikku/cloudflare': patch
'@pikku/kysely': patch
'@pikku/kysely-mysql': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
---

Channels: separate user session from per-socket channel state

Channel runners now use the same `SessionStore` (keyed by `pikkuUserId`) as
HTTP, so a websocket session is the same user session as the HTTP one.
`PikkuChannelSessionService` is removed.

The previous channel-keyed payload remains on `ChannelStore` but renamed to
`state` (`setState`/`getState`/`clearState`), reflecting its real role as
per-socket ephemeral state — not auth identity. On Cloudflare this still
lives on the WebSocket attachment inside the Durable Object.
