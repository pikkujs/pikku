---
type: decision
title: Middleware order is resolution scope first, then priority
description: Middleware is collected global to function, then stably sorted by priority, deduped, frozen and cached per wire
tags: core
---

# Middleware order is resolution scope first, then priority

`combineMiddleware` in `packages/core/src/middleware-runner.ts` builds the chain
for a wire by appending, in this order: global middleware
(`addGlobalMiddleware`), then wire-inherited entries (the HTTP route group, then
tag groups resolved parent-first by `getTagGroups`, then named wire middleware),
then inline wire middleware, then function-inherited tag groups, then inline
function middleware. That collected array is then stably sorted by
`MiddlewarePriority` — `highest` (0) runs first and outermost, `lowest` (4) runs
last and innermost, closest to the function, with `medium` the default — and
finally passed through `freezeDedupe` and cached in `middlewareCache` keyed by
wire type and wire id.

Two properties fall out of that and both are load-bearing. Because the sort is
stable, priority is a coarse band and registration order breaks ties *within* a
band, so declaration order still means something. And because the result is
deduped by function identity, a middleware reachable through both a tag group and
a direct wire registration runs exactly once — a fact several tests assert
directly. `runMiddleware` re-sorts only when `isSortedByPriority` says the input
is not already ordered, which is why the cached array must never be handed back
unsorted.

The cache is why `clearMiddlewareCache()` exists and why dev hot-reload calls it
alongside `clearPermissionsCache()`, `clearChannelMiddlewareCache()` and
`httpRouter.reset()` on every reload.

**What this rules out:** switching `sortByPriority` to a comparator that is not
stable, or to a sort that runs before the scope-ordered collection — either one
silently reorders same-priority middleware and breaks the "declaration order
wins within a band" contract. It also rules out dropping `freezeDedupe` as
redundant (a tag-plus-wire registration would then run twice), and rules out
caching by wire id alone without clearing on reload.
