---
type: question
title: A channel's middleware list accepts bare factories that nothing ever resolves
description: CoreChannel.channelMiddleware admits CorePikkuChannelMiddlewareFactory, but no runner calls one, so a bare factory would stall the chain
tags: core, channel
---

# A channel's middleware list accepts bare factories that nothing resolves

`CoreChannel.channelMiddleware` is typed as
`(CorePikkuChannelMiddleware | CorePikkuChannelMiddlewareFactory)[]`, but
`runPikkuFunc`'s `wireChannelMiddleware` parameter admits only
`CorePikkuChannelMiddleware[]`. The two call sites that bridge them —
`channel-common.ts` and `channel-handler.ts` — assert across the gap.

A factory is `(input: In) => CorePikkuChannelMiddleware`: the author is meant to
*call* it at wiring time and put the result in the array.
`combineChannelMiddleware` contains no factory-resolution branch, and neither
does `combineMiddleware` for ordinary middleware — that is consistent and
deliberate. So a bare, uncalled factory in `channelMiddleware` would be pushed
into the chain and then invoked as if it were middleware: it would receive
`(services, channel, next)` as its single `input` argument, return a middleware
function that nothing runs, and never call `next` — stalling the chain silently.

Nothing in this repository puts a bare factory there, so the failure is
hypothetical today. The type is what invites it.

**What would settle it:** deciding whether `channelMiddleware` should accept
only resolved middleware — in which case the union is simply wrong and should
lose its factory arm, and both assertions disappear — or whether the runner
should resolve factories, in which case `combineChannelMiddleware` needs a
branch and the ordinary middleware path probably needs the matching one.

Until then the assertions name the exact target type rather than `as any`, so
the gap is visible at both call sites.
