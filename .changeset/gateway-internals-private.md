---
'@pikku/core': patch
---

`createListenerMessageHandler` and `resolveGatewayAdapter` are no longer exported from `@pikku/core/gateway`. Both are runner plumbing that the gateway services call by relative path, and `resolveGatewayAdapter` was already tagged `@internal`. `wireGateway` is the gateway API.
