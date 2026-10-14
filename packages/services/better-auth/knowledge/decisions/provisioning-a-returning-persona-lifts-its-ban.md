---
type: decision
title: Provisioning a returning persona lifts its ban
description: When a persona is declared again and its actor account is banned, provisioning unbans it, so a re-declared persona is not left unusable with no visible reason
tags: better-auth, personas, ban, provisioning
---

# Provisioning a returning persona lifts its ban

`packages/services/better-auth/src/provision-personas.ts` looks up each declared
persona's account by email. Two branches apply to an existing row:

- A row that is not an actor is refused with a thrown error that says to give the
  persona an address of its own (`provision-personas.ts:194-198`). The message says
  the persona must not take the roles of somebody else's account.
- An existing actor row that is banned is unbanned, when `banAvailable` is set
  (`provision-personas.ts:214`). The call is `setAuthUserBanned(auth, { userId,
  banned: false })` (`provision-personas.ts:218`), and the result counts it under
  `unbanned` (`provision-personas.ts:219`).

The comment at `provision-personas.ts:215-217` gives the reason: leaving the ban
standing "would make a re-declared persona permanently unusable, with nothing in
the declaration to explain why."

A missing persona gets a new row created with `actor: true` and `emailVerified: true`
(`provision-personas.ts:201-209`). The unban branch only runs for a row that already
exists.

**What this rules out:** a re-declared persona staying banned without any change to
its declaration, and provisioning that runs over a real user's account.
