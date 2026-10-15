---
type: decision
title: A session read that fails is an error, not anonymous
description: Only a genuinely absent session falls through to anonymous; a failed read or a failing caller hook rejects the request so an outage cannot look like a logged-out user
tags: better-auth, session, errors
---

# A session read that fails is an error, not anonymous

The session middlewares return `next()` with no session in two situations: the
caller has no session, or the thing the middleware needs is not in scope (see
[the stand-down rule](a-session-middleware-stands-down-where-it-cannot-authenticate.md)).
A read that fails for any other reason is not allowed to take the same path.

- `betterAuthSession` wraps `auth.api.getSession` in its own `try`. A failure logs
  and rethrows. Its comment says "the normal 'not logged in' path returns null here
  — it does not throw."
- `betterAuthStatelessSession` rethrows a failed cookie-cache read.
- `betterAuthStoreSession` rethrows a failed `store.get`. A secret that is missing
  logs and skips, but any other secret error rethrows.
- `mapSession`, `canImpersonate` and `loadUser` run outside any catch. Their
  comments say a swallowed assertion "turns a malformed session into a silent 403."

The API-key branch is the one deliberate exception. An unverifiable key is caught
and treated as anonymous, because "an unusable key is an ordinary 'not
authenticated', not an outage." A scope-store failure after a valid key sits
outside that catch and surfaces.

**What this rules out:** catching a session read failure and serving the request
anonymously, and swallowing errors from app hooks to avoid a 500.
