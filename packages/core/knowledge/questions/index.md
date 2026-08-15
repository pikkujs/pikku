---
type: overview
title: Questions
description: Things asked of core and not yet answered
---

# Questions

Something asked and not yet answered. A question earns a note when the code
currently makes a choice that nobody has defended — the choice stays, the doubt
gets recorded.

<!-- pikku:knowledge-index -->

- [A channel's middleware list accepts bare factories that nothing ever resolves](channel-middleware-accepts-bare-factories-that-nothing-resolves.md) — CoreChannel.channelMiddleware admits CorePikkuChannelMiddlewareFactory, but no runner calls one, so a bare factory would stall the chain
- [An unauthorized channel reply is sent outside the channel's declared Out type](unauthorized-channel-replies-escape-the-declared-out-type.md) — processMessageHandlers sends a bare string on auth failure, which no generated client type admits — nobody has decided what the typed shape should be

<!-- /pikku:knowledge-index -->
