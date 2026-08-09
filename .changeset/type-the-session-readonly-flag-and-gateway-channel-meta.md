---
'@pikku/core': patch
---

Declare `CoreUserSession.readonly` and `ChannelMeta.gateway`, which the runtime already used

The function runner throws `ReadonlySessionError` when a session is marked `readonly` and the function is not, but `CoreUserSession` never declared the field — so there was no typed way to build a readonly session, and even core's own test had to cast. Likewise `wireGateway` writes `gateway: true` onto a websocket channel's meta, which `ChannelMeta` did not admit. Both are now declared.

The gateway websocket path also wrote channel meta without `input`, `disconnect` or `messageWirings`, all of which `ChannelMeta` requires and `channel-handler` indexes without a guard. It now writes a complete record.
