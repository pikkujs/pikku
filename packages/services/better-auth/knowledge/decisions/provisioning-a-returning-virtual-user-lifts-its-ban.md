---
type: decision
title: Provisioning a returning virtual user lifts its ban
description: When a virtual user is declared again and its account is banned, provisioning unbans it, so a re-declared virtual user is not left unusable with no visible reason
tags: better-auth, virtual-users, ban, provisioning
---

# Provisioning a returning virtual user lifts its ban

`provisionVirtualUsers` (`packages/services/better-auth/src/provision-virtual-users.ts`)
looks up each declared virtual user's account by email. Two branches apply to an
existing row:

- A row without the `virtualUser` flag is refused with a thrown error that says to
  give the virtual user an address of its own. The message says the virtual user
  must not take the roles of somebody else's account.
- An existing virtual user row that is banned is unbanned, when `banAvailable` is
  set. The call is `setAuthUserBanned(auth, { userId, banned: false })`, and the
  result counts it under `unbanned`.

The comment on that branch gives the reason: leaving the ban standing "would make
a re-declared virtual user permanently unusable, with nothing in the declaration
to explain why."

A missing virtual user gets a new row created with `virtualUser: true` and
`emailVerified: true`. The unban branch only runs for a row that already exists.

**What this rules out:** a re-declared virtual user staying banned without any
change to its declaration, and provisioning that runs over a real user's account.
