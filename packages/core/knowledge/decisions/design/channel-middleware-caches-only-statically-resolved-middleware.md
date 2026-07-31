---
type: decision
title: Channel middleware caching covers only statically resolved middleware
description: Inherited tag/named middleware is cached per uid; per-run closures are appended fresh every call, at the cost of re-allocating the array
tags: channel
---

# Channel middleware caching covers only statically resolved middleware

`combineChannelMiddleware` in
`packages/core/src/wirings/channel/channel-middleware-runner.ts` caches only the
`wireInheritedChannelMiddleware` slice — the tag groups and named middleware
resolved out of `pikkuState` — under the key `${wireType}:${uid}`. That slice is
deterministic for a given `uid`. `wireChannelMiddleware` is not: it is a per-run
set of closures, such as an AI agent's per-invocation stream middleware holding
that run's thread and session state. Caching it would let a later run of the same
`uid` reuse an earlier run's closures, leaking that run's state into a different
user's stream and growing memory run over run. It is therefore appended fresh on
every call, after the cached inherited slice.

The `uid` matters as much as the cache split. `processMessageHandlers` in
`channel-handler.ts` builds it from the channel name *plus* the routing property
and router value (`${name}:${routingProperty}:${routerValue}`, or
`${name}:default`), because several message routes on one channel may point at
the same function — a key based on the function alone would serve one route's
middleware chain to another. Ordering within the combined chain is also fixed:
channel-level `middleware` runs before message-level `middleware`.

**What this rules out:** extending the cache key's value to include
`wireChannelMiddleware`, memoising the whole combined array, or simplifying the
cache key down to the channel or function name.
