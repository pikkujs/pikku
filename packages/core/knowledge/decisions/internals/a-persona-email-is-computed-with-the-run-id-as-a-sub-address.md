---
type: decision
title: A persona's email is computed from its id, with the run id as a sub-address
description: personaEmail derives the address from the persona id and a real domain, appends the run id so concurrent runs get separate inboxes and accounts, and refuses colliding addresses
tags: core, personas, email, runs
---

# A persona's email is computed from its id, with the run id as a sub-address

`packages/core/src/wirings/persona/persona-email.ts` computes the address a persona
reads mail at. Nothing is declared by hand.

The label is the persona id, lower-cased, with runs of non-alphanumerics turned
into `-` and leading or trailing dashes removed (`persona-email.ts:19-30`). A
persona id with no letters or digits left throws (`persona-email.ts:24-28`).

The domain must contain a dot and no `@` (`persona-email.ts:49-54`). The error
asks for "a domain the stage actually receives mail on" (`persona-email.ts:52`).

With a `runId`, the address is `label+runLabel@domain` (`persona-email.ts:55-56`).
The doc comment says that without the suffix, two concurrent runs share "an inbox
*and* a user row, and run B reads run A's magic link" (`persona-email.ts:35-37`).
Without a `runId`, the bare form is returned (`persona-email.ts:40-41`).

`personaEmails` throws when two personas compute the same address
(`persona-email.ts:76-82`). The comment says they "would share a user row and read
each other's email" (`persona-email.ts:79-80`).

All of one persona's logins share one address (`persona-email.ts:62-66`). The
comment gives the reason: better-auth keeps `email` on the `user` and defaults
`allowDifferentEmails` to false.

**What this rules out:** two concurrent runs sharing an inbox, and two personas
mapping to one account.
