---
'@pikku/core': patch
---

Add gateway meta-wiring for messaging platforms:

- New `wireGateway()` API with three transport types: webhook, websocket, listener
- `GatewayAdapter` interface for platform-specific parse/send logic
- `PikkuGateway` wire object (`wire.gateway`) with senderId, platform, and send()
- `startListenerGateway()` for standalone event loop adapters
- Add `'gateway'` to `PikkuWiringTypes` and `gateway` to `PikkuWire`
- Add `gateway` state block to `PikkuPackageState`
