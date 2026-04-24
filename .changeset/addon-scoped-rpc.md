---
'@pikku/core': patch
---

feat(core): scope bare `rpc.invoke()` calls to the caller's addon package

Addon functions calling `rpc.invoke('foo')` (bare, no colon) previously only
resolved against root RPC meta and threw `RPCNotFoundError` for the addon's
own functions, forcing authors to prefix every call with their consumer-facing
namespace (`'cli:foo'`) — which couples the addon to its caller's `wireAddon({ name })`.

`ContextAwareRPCService` now carries an optional `packageName` passed through
from `runPikkuFunc` via `getContextRPCService`. For bare names from inside an
addon, resolution first checks the caller's package function meta, then falls
back to root. Applies to both `rpc.invoke()` and `rpc.rpcWithWire()`. Explicit
namespaced calls (`'stripe:createCharge'`) and root-namespace calls are unchanged.
