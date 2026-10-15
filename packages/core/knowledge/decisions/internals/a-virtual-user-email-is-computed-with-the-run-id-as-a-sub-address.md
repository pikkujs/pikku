---
type: decision
title: A virtual user's email is computed from its id, with the run id as a sub-address
description: virtualUserEmail derives the address from the virtual user id and a real domain, appends the run id so concurrent runs get separate inboxes and accounts, and refuses colliding addresses
tags: core, virtual-users, email, runs
---

# A virtual user's email is computed from its id, with the run id as a sub-address

`packages/core/src/wirings/virtual-user/virtual-user-email.ts` computes the address a virtual user
reads mail at. Nothing is declared by hand.

The label is the virtual user id, lower-cased, with runs of non-alphanumerics turned
into `-` and leading or trailing dashes removed (`virtual-user-email.ts:19-30`). A
virtual user id with no letters or digits left throws (`virtual-user-email.ts:24-28`).

The domain must contain a dot and no `@` (`virtual-user-email.ts:49-54`). The error
asks for "a domain the stage actually receives mail on" (`virtual-user-email.ts:52`).

With a `runId`, the address is `label+runIdLabel@domain` (`virtual-user-email.ts:55-56`).
The doc comment says that without the suffix, two concurrent runs share "an inbox
_and_ a user row, and run B reads run A's magic link" (`virtual-user-email.ts:35-37`).
Without a `runId`, the bare form is returned (`virtual-user-email.ts:40-41`).

`virtualUserEmails` throws when two virtual users compute the same address
(`virtual-user-email.ts:76-82`). The comment says they "would share a user row and read
each other's email" (`virtual-user-email.ts:79-80`).

All of one virtual user's logins share one address (`virtual-user-email.ts:62-66`). The
comment gives the reason: better-auth keeps `email` on the `user` and defaults
`allowDifferentEmails` to false.

**What this rules out:** two concurrent runs sharing an inbox, and two virtual users
mapping to one account.
