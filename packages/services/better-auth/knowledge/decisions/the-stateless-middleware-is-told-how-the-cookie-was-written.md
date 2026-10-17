---
type: decision
title: The stateless middleware is told how the cookie was written
description: betterAuthStatelessSession never builds the auth instance, so a custom cookie prefix and a cookie-cache version are passed to it, a jwe or jwt strategy is recognised from the cookie's shape, and pikkuBetterAuth reports a mismatch
tags: [better-auth, session, stateless, cookies]
---

# The stateless middleware is told how the cookie was written

`betterAuthStatelessSession` exists so that a unit can authenticate without
bundling the better-auth server. It therefore cannot read the app's
`betterAuth({ ... })` options, and those options decide how `session_data` is
written:

- **Prefix.** `advanced.cookiePrefix` renames the cookie. It is passed as the
  middleware's `cookiePrefix`. Without it, the middleware never finds the
  cookie and every request is anonymous.
- **Version.** `session.cookieCache.version` is how an app invalidates every
  outstanding cookie. It is passed as `cookieCache.version`. Without it, a
  cookie of any version verifies, and the version bump revokes nothing.
- **Strategy.** `compact`, `jwt` and `jwe` cookies have different shapes: one
  segment, three dot-separated parts and five. When `cookieCache.strategy` is
  not passed, the middleware recognises the strategy from that shape. This is
  safe because each strategy still verifies the value against the secret. A
  JWKS-verified `jwt` needs `cookieCache.jwt`.

Reading the options off a built instance was rejected, because building one is
the cost the middleware exists to avoid. Instead, each constructed middleware
records what it was given. When `pikkuBetterAuth` builds the instance in the
same process, it compares the two and logs an error on a mismatch
(`reportStatelessCookieMismatch` in `stateless-cookie-default.ts`).

**What this rules out:** silently treating a request as anonymous because of a
renamed cookie, and accepting cookies that a version bump was meant to
invalidate.
