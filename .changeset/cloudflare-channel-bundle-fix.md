---
'@pikku/cloudflare': patch
'@pikku/deploy-cloudflare': patch
---

fix(cloudflare): channel unit bundle was missing the `WebSocketHibernationServer` named re-export

Two issues blocked Workers-for-Platforms channel deploys:

1. The CF deploy adapter generated `entry.ts` with
   `export { PikkuWebSocketHibernationServer ... } from '@pikku/cloudflare/websocket'`,
   but `PikkuWebSocketHibernationServer` actually lives in
   `@pikku/cloudflare/handler` (`/websocket` exports the abstract base
   `CloudflareWebSocketHibernationServer`). Switched the adapter import to
   `/handler`.
2. With `bundle: true, format: 'esm'`, esbuild tree-shook the named
   re-export because nothing inside the bundle used it — leaving CF to
   reject the upload with `10070: Cannot apply new-class migration to
   class 'WebSocketHibernationServer' that is not exported by script`.
   Added `sideEffects` to `@pikku/cloudflare`'s package.json marking
   `handler-factories.js` and `cloudflare-hibernation-websocket-server.js`
   as side-effectful so esbuild preserves the export.

Together these let `wireChannel(...)` units deploy to a Workers-for-Platforms
dispatch namespace with the DO migration accepted.
