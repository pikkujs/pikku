---
'@pikku/core': patch
'@pikku/cli': patch
---

Two gaps from the August security sweep that never reached main:

- The memoized middleware chains are capped per wire type. The key is the requested wire id, so a caller varying RPC names could otherwise grow the cache without limit.
- The console's generated variable brokers require `pikku:console`. They are emitted into the application rather than the console addon, so the addon's scope never reached them and any signed-in user could read and overwrite variables through `/rpc`.
