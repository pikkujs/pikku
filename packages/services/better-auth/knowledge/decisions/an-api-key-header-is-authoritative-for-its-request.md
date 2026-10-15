---
type: decision
title: An API key header is authoritative for its request
description: When the key header is present the middleware never falls back to the cookie session, and a key-minted session can be restricted to a set that is never widened back to the owner's rights
tags: better-auth, api-key, scopes
---

# An API key header is authoritative for its request

With the `apiKey` option set, a request carrying the key header (`x-api-key` by
default) is resolved on the machine path in `betterAuthSession`:

1. `auth.api.verifyApiKey` checks the key.
2. If it is valid, `apiKey.mapKey(key, services)` produces the session, which goes
   through `withResolvedScopes` and is set.
3. Whatever the outcome, the middleware calls `next()`. It never reaches
   `getSession`.

The reason for step 3 is in the code comment. better-auth's `getSession()` returns
a metadata-less mock session for an API key, and that would shadow the scoped one.
An invalid key is therefore an anonymous request, not a fallback to a cookie.

**Restricted keys.** `mapKey` can set `scopes` to mint a restricted key. An
explicit set, including an empty one, is authoritative. `withResolvedScopes` fills
only an absence, so it cannot widen a deliberate restriction back to everything the
owning user holds. Leaving `scopes` unset gives a key that acts with its owner's
full rights.

**What this rules out:** using the cookie session when a key header is present,
resolving a restricted key's scopes from its owner, and treating a `mapKey` that
returns nothing as anything other than anonymous.
