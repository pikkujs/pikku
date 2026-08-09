---
type: question
title: An unauthorized channel reply is sent outside the channel's declared Out type
description: processMessageHandlers sends a bare string on auth failure, which no generated client type admits — nobody has decided what the typed shape should be
tags: core, channel
---

# An unauthorized channel reply is sent outside the channel's declared Out type

When a message arrives on a channel route that requires a session and none is
attached, `processMessageHandlers` in
`packages/core/src/wirings/channel/channel-handler.ts` logs the failure and then
sends the client a bare string:

```ts
channelHandler.getChannel().send(`Unauthorized for ${routeMessage}`)
```

That compiles only because `processMessageHandlers` takes
`PikkuChannelHandler`, whose generics default to `<unknown, unknown>`, so `send`
accepts anything at this call site. The channel the application actually
declared has a concrete `Out`, and the generated client is typed from it. A
client can therefore receive a value its own types say is impossible, and no
`@pikku/client-websocket` consumer has a branch for it.

The alternatives were never worked through:

- **Widen every channel's `Out`** to `Out | ChannelError`, so the error is part
  of the contract. Honest, but it forces a discriminated union on every consumer
  including channels that can never fail auth.
- **Send on a reserved envelope** the way `channel-rpc` does, and let the client
  library surface it out-of-band rather than as a message. Keeps `Out` clean,
  but adds a second framing that every runtime adapter has to honour.
- **Send nothing** and let the close code carry it. Simplest, and loses the
  route name that makes the failure debuggable.

Until one is chosen the string stays, because dropping it silently is worse: a
client that is quietly ignored has no way to tell "unauthorized" from "the
server is slow".

**What would settle it:** deciding whether channel-level errors belong in `Out`
at all, which is the same question `channel-rpc` already answered for RPC frames
by giving them their own envelope. If the answer is "same as RPC", this becomes
a decision note and the string becomes an envelope.
