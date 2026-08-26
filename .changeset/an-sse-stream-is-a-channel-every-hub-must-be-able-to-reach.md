---
'@pikku/core': patch
'@pikku/bun-server': patch
'@pikku/uws-handler': patch
'@pikku/cloudflare': patch
'@pikku/lambda': patch
'@pikku/kysely-postgres': patch
---

Make an SSE stream a channel every event hub can actually reach, and fail loudly where one cannot.

`EventHubService` declared `subscribe`/`unsubscribe`/`publish` and nothing else, while the channel lifecycle was called all over the place and typed nowhere. Two incompatible conventions grew up in that gap: core and the Node hubs used `onChannelOpened(channelHandler)`, and the Bun and uWS hubs used `onChannelOpened(channelId, socket)`. Nothing could see the collision, so an SSE route served by Bun registered its stream under an object key, every later `subscribe` looked it up by string and missed, and the connection stayed open and completely silent — indistinguishable, from the browser, from a working one.

`onChannelOpened(channelHandler)` and `onChannelClosed(channelId)` are now part of the interface, so the mismatch is a compile error rather than a quiet no-op. `PikkuChannelHandler` is the only shape that describes both transports, because it abstracts `send`/`sendBinary` away from what is underneath. Bun and uWS still need the raw socket, and now take it through their own `registerSocket(channelId, ws)` — a different operation under a different name, which is the distinction whose absence caused this.

Registration alone was not enough: `server.publish` on Bun and `socket.publish` on uWS reach WebSockets and nothing else, so a correctly subscribed SSE stream still received nothing. Both hubs now keep a `LocalEventHubService` for channels that are not their native socket and publish to both, the same arrangement `PgEventHubService` already used for its fallback. `PgEventHubService` itself had a narrower version of the same bug — lifecycle went to its built-in hub while every other method went to the injected one — and now routes all of them to `delivery`.

Lambda and Cloudflare genuinely cannot do this: the stream and the publisher are not in the same isolate, and there is no reference to keep. They now throw from `onChannelOpened` rather than accept a channel they will never deliver to. Core warns when an SSE route is served with no hub at all.

A shared `defineEventHubServiceTests` conformance suite ships from `@pikku/core/testing` and asks the question the per-runtime tests could not: can a channel that is not this runtime's native socket receive a publish? The old Bun test passed throughout because it encoded the broken signature instead of checking the behaviour.
