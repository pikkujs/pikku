---
type: question
title: Does cors origin: true reflect any origin when credentials are on?
description: The credentials guard only refuses the wildcard origin, so origin: true with credentials reflects whichever origin asks
tags: core, middleware, cors
---

# Does cors origin: true reflect any origin when credentials are on?

In `packages/core/src/middleware/cors.ts:55-56`, `origin: true` sets the allowed
origin to the request's `Origin` header, or to `*` when none is sent.

The guard at `:36-40` throws only when the origin is the string `'*'` and
`credentials` is true. `origin: true` is not that string, so the combination is
accepted with no throw. The file does not check that the reflected origin is in a
list.

**Question:** is `origin: true` with `credentials: true` meant to reflect any caller
origin, or should it be refused like the wildcard? The guard and its message cover
only the wildcard. The `origin: true` option has no note in this folder.
