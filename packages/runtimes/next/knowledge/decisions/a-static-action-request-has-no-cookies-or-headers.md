---
type: decision
title: A static Next action request answers null for every cookie and header and an empty object for the header map
description: PikkuActionNextRequest reads cookies() and headers() only when it was built dynamic, so static page generation sees no credentials instead of an error
tags: next, actions, cookies, sessions
---

# A static Next action request answers null for every cookie and header and an empty object for the header map

`PikkuActionNextRequest` in `packages/runtimes/next/src/pikku-action-next-request.ts` takes a `dynamic`
flag as its last constructor argument (line 31). `init()` reads `cookies()` and `headers()` from
`next/headers.js` only when that flag is true (lines 67-75).

When it is false, `cookie(name)` returns `null` (lines 85-88) and `header(name)` returns `null`
(lines 110-113). `headers()` returns `{}` (lines 95-97). The doc comments say this is so middleware can
"gracefully handle static page generation" (lines 78-82 and 102-106).

When the flag is true and `init()` has not run, both accessors throw `Init first needs to be called`
(lines 89-91 and 114-116).

`staticActionRequest` in `packages/runtimes/next/src/pikku-next.ts` builds its request with `false` as the
last argument (lines 84-89) and passes `skipUserSession: true` (lines 91-94); the open question about why it also skips the user session is in
[should-a-static-action-request-skip-the-user-session](../questions/should-a-static-action-request-skip-the-user-session.md).

**What this rules out:** reading a session from a cookie or header on a static action request, and treating
the `null` as an authentication failure: the request simply has no credentials to offer.
