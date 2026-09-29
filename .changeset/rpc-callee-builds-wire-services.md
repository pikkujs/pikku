---
'@pikku/core': patch
---

Fix app functions reached through `rpc.invoke`/`rpc.exposed` (including the generated `/rpc/:rpcName` endpoint) running without their wire services. Since `singletonServicesOnly`, the forwarding `rpcCaller` built none and the callee inherited that, so any service from `pikkuWireServices` was `undefined`. The runner now resolves the callee's factory itself. Channels pass their per-connection set as the new `wireServices` option, which is reused and left open.
