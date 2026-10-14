---
type: decision
title: The stateless session cookie gets a one-day lifetime unless the app sets one
description: With betterAuthStatelessSession in use, a cookie cache left at better-auth's 300 seconds would sign users out five minutes after login, so pikku inserts a day or a stage variable's value
tags: better-auth, session, cookies, stateless
---

# The stateless session cookie gets a one-day lifetime unless the app sets one

`betterAuthStatelessSession` verifies the signed `session_data` cookie with the
secret alone. It does not call `services.auth()` and does not touch the database,
so the cookie is the only thing authenticating a request. better-auth's default
`session.cookieCache.maxAge` is 300 seconds. Here that default is a hard session
limit, and nothing rewrites the cookie in between.

Three rules in `stateless-cookie-default.ts` follow:

- **Scoped to this configuration.** The default applies only after
  `betterAuthStatelessSession` has been constructed (`markStatelessSessionInUse`).
  Under the stateful middleware the cookie cache is a cache in front of the
  database, and a short life is a deliberate trade. Lengthening it there would
  widen someone's revocation window.
- **Insert, never upsert.** An explicit `maxAge`, including a short one, is left
  alone. So is a cookie cache that is disabled.
- **Stage variable first.** `SESSION_COOKIE_CACHE_MAX_AGE` overrides the one-day
  default. A value that is not a positive number of seconds logs a warning and
  falls back to the default. The file's comment calls the one-day figure
  "defensible" rather than correct for every app.

The same limit is also the longest a ban or a revoked session can go unnoticed on
this path. See [a banned user is refused at session creation](a-banned-user-is-refused-at-session-creation-and-lapses-on-expiry.md).

**What this rules out:** leaving stateless sessions at 300 seconds, and changing a
cookie lifetime the app set on purpose.
