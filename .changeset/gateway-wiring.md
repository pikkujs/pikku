---
'@pikku/core': patch
---

Add gateway meta-wiring for messaging platforms:

- New `wireGateway()` API with three transport types: webhook, websocket, listener
- `GatewayAdapter` interface for platform-specific parse/send logic
- `PikkuGateway` wire object (`wire.gateway`) with senderId, platform, and send()
- `GatewayService` interface and `LocalGatewayService` for listener gateway lifecycle
- `createListenerMessageHandler()` helper for building listener message callbacks
- Add `'gateway'` to `PikkuWiringTypes` and `gateway` to `PikkuWire`
- Add `gateway` state block to `PikkuPackageState`
