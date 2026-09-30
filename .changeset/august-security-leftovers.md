---
'@pikku/core': patch
'@pikku/cli': patch
---

Three gaps from the August security sweep that never reached main:

- A channel's `auth` now gates its `onConnect` and `onDisconnect` functions as it already gated its message handlers, so an `auth: true` channel no longer runs its lifecycle for a peer without a session.
- The memoized middleware chains are capped per wire type. The key is the requested wire id, so a caller varying RPC names could otherwise grow the cache without limit.
- The console's generated variable brokers require `pikku:console`. They are emitted into the application rather than the console addon, so the addon's scope never reached them and any signed-in user could read and overwrite variables through `/rpc`.
