---
type: decision
title: The SPA fallback runs after route dispatch
description: Static mounts serve exact file hits before dispatch, but the index.html fallback only runs once dispatch has produced a 404
tags: [http, static-mounts, spa, frontend]
---

# The SPA fallback runs after route dispatch

A static mount used to be resolved entirely before the router got a look at the
request: match the prefix, try the file, and on a miss serve `index.html` when
`spaFallback` was set. That works for `/console`, which shares no paths with the
API, and it breaks the moment a mount covers the whole tree.

A frontend served at `/` is exactly that mount. Under the old order every
request matched the prefix, every API path missed on disk, and the fallback
answered `GET /api/things` with a 200 and the app shell — an API that returns
HTML to its own client, with no error anywhere to explain it.

So the pipeline splits the mount into two passes. An **exact file hit** is
served before dispatch, because a real asset on disk is never a route. A
**miss** falls through to the router, which gets its normal chance to match. Only
when dispatch has produced a 404 does the fallback serve `index.html`, on the
reading that a path no route claimed and no file backs is the SPA's own routing.

The two passes are not symmetrical about failure. `serveStaticFile` reports
`served`, `missing`, or `rejected`, and the third exists solely so a key that
resolved outside the mount directory is refused outright. Folding it into
`missing` would let a traversal attempt fall through to the fallback and come
back as a 200 — turning a blocked read into a successful one.

`matchesPrefix` special-cases the root for the same feature. The generic test is
`pathname === prefix || pathname.startsWith(prefix + '/')`, which for a prefix of
`/` matches only `/` itself, since nothing starts with `//`.

`@pikku/bun-server` carries the identical structure, and both packages have a
root-mount test asserting a wired route still dispatches under a `/` SPA mount.
That test fails — and only that test fails — if the fallback is moved back ahead
of dispatch.

**What this rules out:** resolving static mounts in a single pass, and treating a
rejected path the same as a missing one.
