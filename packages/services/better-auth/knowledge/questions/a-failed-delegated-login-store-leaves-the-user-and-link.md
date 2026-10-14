---
type: question
title: Does a failed delegated-login credential store leave the user and link behind on purpose?
description: The user row and the delegated account link are written before storeCredential; if the store throws, nothing removes them and the next sign-in reuses the link
tags: better-auth, delegated-auth, credentials
---

# Does a failed delegated-login credential store leave the user and link behind on purpose?

In `pikkuDelegatedAuth` (`packages/services/better-auth/src/delegated-auth-plugin.ts`,
around lines 220–265), the sequence is:

1. create the user row, or reuse an existing one;
2. `adapter.linkAccount` with providerId `delegated`;
3. `grantRole`;
4. `options.storeCredential(user.id, identity)`, which on throw returns
   `INTERNAL_SERVER_ERROR` and creates no session.

When step 4 fails, the user row and the link from steps 1–2 remain. The next
sign-in finds the link and proceeds. The code has no comment on this, so it is
unknown whether the leftover rows are wanted, for example to make a retry
cheaper, or are an accident of ordering.

Open: should the failure path remove what it created in this request, or should
the order change so the credential is stored first? Either choice is a rule the
code does not currently state.
