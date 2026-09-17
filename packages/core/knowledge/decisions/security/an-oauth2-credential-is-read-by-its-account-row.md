---
type: decision
title: An OAuth2 credential is read by its account row, not by its provider name
description: better-auth 1.7.5 selects an account by row id under a strict body schema, so BetterAuthCredentialService resolves the row through the internal adapter before asking for a token
tags: better-auth, credentials, oauth2
---

# An OAuth2 credential is read by its account row, not by its provider name

A pikku OAuth2 credential is named — `user-oauth`, `company-slack` — and that
name is the better-auth `providerId` its account row carries. Reading the
credential used to mean handing better-auth the name:
`getAccessToken({ body: { providerId, userId } })`.

better-auth 1.7.5 stopped accepting that. `get-access-token` and
`unlink-account` both take a strict union selecting the account by its **own row
id**, so a provider name is not merely ignored, it is rejected — `[body] Invalid
input`, a 500 on every read of a linked credential: a tool's token, an agent's,
the console's status card. An agent that cannot resolve its credential never
makes a model call, so the failure surfaces far from its cause.

So the name is resolved to a row first, through
`context.internalAdapter.findAccounts(userId)` — the same lookup the link
callback writes the row with and `unlinkAccount` already used. That is also the
only account lookup that takes a userId at all: `listUserAccounts` resolves the
*caller's session* and throws UNAUTHORIZED server-side, which is no use for the
two revocations that have no session — a platform credential, whose owner never
signs in, and an admin acting on someone else's.

A useful consequence: an unlinked provider is now answered before better-auth is
asked, rather than by catching its `ACCOUNT_NOT_FOUND`. The catch stays, because
a failed refresh must still not read as "not connected yet" — that would show a
connect button for an account that is linked but broken.

**What this rules out:** treating `providerId` as a credential's address
anywhere a token is read or revoked. It remains the credential's *name* — what
an app declares and what the link flow writes — but the row id is what
better-auth is spoken to in. A fake of better-auth that keys tokens by provider
name will pass while the real thing rejects every call, which is how this
survived a bump with 222 green unit tests behind it.
