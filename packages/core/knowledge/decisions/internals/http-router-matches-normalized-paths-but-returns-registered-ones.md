---
type: decision
title: The HTTP router matches normalized paths but returns the registered path
description: Matching normalizes the leading slash while the match result carries the original key, because pikkuState is keyed by the registered string
tags: http
---

# The HTTP router matches normalized paths but returns the registered path

`PathToRegexRouter` in `packages/core/src/wirings/http/routers/path-to-regex.ts`
normalizes every route and every incoming path to a leading `/` before matching,
so a route registered as `'todos'` still answers a request for `/todos`. The
`route` field it stores alongside each matcher and static entry is the
_un-normalized_ original, and that is what `MatchResult.route` returns.

That asymmetry is load-bearing. `getMatchingRoute` in `http-runner.ts` takes the
returned route and uses it as a key into `pikkuState(null, 'http', 'routes')` and
into the HTTP meta record — both of which are keyed by exactly the string the
author passed to `wireHTTP`. Returning the normalized path instead would miss
those lookups for any route registered without a leading slash.

The same router also compiles channel routes, registered under the `get` method,
because a WebSocket connection arrives as an HTTP GET upgrade;
`getMatchingChannelConfig` in `channel-runner.ts` matches through
`httpRouter.match('get', path)`. Channels and HTTP GET routes therefore share one
path namespace and can collide with each other.

**What this rules out:** simplifying the compile step to store
`normalizedRoutePath` in both places, and treating the channel routes compiled
into the GET table as stray entries to be removed from the HTTP router.
