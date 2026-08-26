---
'@pikku/core': patch
'@pikku/bun-server': patch
'@pikku/uws-handler': patch
'@pikku/cloudflare': patch
'@pikku/lambda': patch
'@pikku/kysely-postgres': patch
---

Fix SSE channels never receiving published events.

`onChannelOpened`/`onChannelClosed` were called but not declared on `EventHubService`, so two signatures diverged: `onChannelOpened(channelHandler)` in core, `onChannelOpened(channelId, socket)` in the Bun and uWS hubs. An SSE stream on those runtimes registered under the wrong key and stayed open and silent. Both are now on the interface; Bun and uWS take the raw socket through `registerSocket(channelId, ws)` instead.

`server.publish` (Bun) and `socket.publish` (uWS) only reach WebSockets, so both hubs now also keep a `LocalEventHubService` for non-socket channels and publish to both. `PgEventHubService` routed its lifecycle to the built-in hub while everything else went to the injected one; it now uses `delivery` throughout.

Lambda and Cloudflare cannot hold a stream the publisher can reach, so they throw from `onChannelOpened` rather than accept and drop. Core warns when an SSE route has no hub configured.

Adds `defineEventHubServiceTests` to `@pikku/core/testing`, a conformance suite covering delivery to a channel that is not the runtime's native socket.
