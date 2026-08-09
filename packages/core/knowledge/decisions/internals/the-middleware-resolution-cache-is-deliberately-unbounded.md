---
type: decision
title: The middleware resolution cache is deliberately unbounded
description: Its keyspace is the set of registered wires, not request traffic, and middleware is dynamic — so eviction would buy nothing and cost the dedupe guarantee
tags: core, middleware
---

# The middleware resolution cache is deliberately unbounded

`middlewareCache` in `packages/core/src/middleware-runner.ts` is a plain
`Record<PikkuWiringTypes, Record<string, readonly CorePikkuMiddleware[]>>` with
no size limit and no eviction. That reads like an unbounded-growth bug and is
not one.

**The keyspace is finite by construction.** The cache is keyed by wire type and
wire id, and wire ids come from registration, not from traffic — an HTTP route
pattern, a channel name, a queue name. A million requests to the same route
produce one entry. Nothing a caller sends creates a key: a channel message key
is `${channel}:${routingProperty}:${routerValue}`, and `routerValue` is only
reached after matching `routes[routerValue]`, so an unregistered value never
gets that far.

**Middleware is dynamic, and the cache is invalidated rather than aged out.**
`addGlobalMiddleware` and `addTagMiddleware` can run after startup, and dev
hot-reload rewires wholesale — so correctness comes from `clearMiddlewareCache()`
at the points where the middleware set actually changes, not from entries
expiring. An LRU would evict entries that are still current while doing nothing
about entries that are stale.

**Eviction would also weaken the chain itself.** `combineMiddleware` returns a
`freezeDedupe`d array, and dedupe is by function identity — a middleware
reachable through both a tag group and a direct wire registration runs exactly
once. Callers hold that array. Recomputing it under memory pressure hands out a
second array for the same wire, which is churn at best and, for anything
comparing chains by identity, a silent behaviour change.

**What this rules out:** adding a `MIDDLEWARE_CACHE_MAX` with LRU eviction as a
denial-of-service mitigation. There is no traffic-driven growth to mitigate. If
a future change ever keys this cache by something a caller controls, that is the
bug — bound the key, not the cache.
