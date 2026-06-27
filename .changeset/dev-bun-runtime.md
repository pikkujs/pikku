---
'@pikku/cli': patch
---

feat(dev): `pikku dev` serves over the bun runtime when the CLI runs under bun

When the Pikku CLI itself runs under bun (e.g. the compiled `brew install`
binary), `pikku dev` now serves over `@pikku/bun-server` (native `Bun.serve`
WebSockets) instead of the node http server + `ws` package. The bun server is
dynamically imported and gated on `typeof Bun !== 'undefined'`, so a node-run
CLI is unaffected and keeps using `@pikku/node-http-server`. The dev server
shares one `BunEventHubService` between the singleton services and the
WebSocket transport so channel broadcasts reach connected sockets.
