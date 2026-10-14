---
type: decision
title: A delegated login never claims an existing user by a synthetic email
description: Upstream login may attach to an existing user row only when the upstream itself returned that email, and never to an actor row or to a user already bound to another upstream identity
tags: better-auth, delegated-auth, accounts
---

# A delegated login never claims an existing user by a synthetic email

`pikkuDelegatedAuth` (`delegated-auth-plugin.ts`) lets the imported upstream API
be the identity provider. The user's existing upstream credentials are checked by
`authenticate`, and the result is linked to a local user through an `account` row
with `providerId: 'delegated'`.

The lookup order is fixed:

1. **Existing link.** An account with the same `(delegated, externalId)` gives the
   user. Only the name is refreshed. The email is left alone, so an upstream email
   change cannot collide with another local row.
2. **Email already in use.** Refused if `identity.syntheticEmail !== false`. The
   doc on `UpstreamIdentity` says an email made up from the login, or a login typed
   as an email, "never claims an existing user row." Only an email the upstream
   itself returned can attach.
3. **Actor row.** Always refused. The message is "User cannot sign in with upstream
   credentials."
4. **Already bound to a different upstream user.** Refused.
5. **Otherwise** a new user is created, email-verified, and linked.

Omitting `syntheticEmail` counts as synthetic, which is the safer default.

**What this rules out:** attaching a made-up email to a real account, attaching an
upstream identity to an actor row, and binding one local user to two upstream
identities.
