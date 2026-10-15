---
type: decision
title: A store-backed session is signature-checked before the store is read
description: betterAuthStoreSession rejects an unsigned or forged credential before any store lookup, and signing out deletes the store entry so revocation is immediate on both transports
tags: better-auth, session, store, revocation
---

# A store-backed session is signature-checked before the store is read

`betterAuthStoreSession` resolves a session through better-auth's
`secondaryStorage`, where the session token is the store key. One `get` yields
`{ session, user }`, with no database read and no better-auth server.

The credential is better-auth's signed `token.signature` value. It arrives either
as `Authorization: Bearer` (when `transports` includes `header`) or as the session
cookie (when it includes `cookie`). `verifySessionCredential`
(`session-credential.ts`) requires the signature and checks it with HMAC-SHA256
using `BETTER_AUTH_SECRET`. A bare, unsigned token is rejected here even though
better-auth's `bearer()` plugin would accept one. The comment says the signature
exists to give "the cheap rejection" before a store read is paid for.

After the store read, the session must have a user and must not be past
`session.expiresAt`.

Revocation is immediate on both transports. Signing out deletes the store entry,
so the next request finds nothing. The comment contrasts this with
`betterAuthStatelessSession`, which cannot see a revocation until its cookie cache
expires. See [the stateless cookie default](the-stateless-session-cookie-gets-a-one-day-lifetime-unless-the-app-sets-one.md).

**What this rules out:** reaching the store with an unsigned or forged credential,
and relying on cache expiry to revoke a session on this path.
