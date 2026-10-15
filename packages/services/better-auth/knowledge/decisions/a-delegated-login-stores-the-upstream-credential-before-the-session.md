---
type: decision
title: A delegated login stores the upstream credential before the session
description: If the upstream token cannot be persisted the sign-in fails outright, because every proxied call would be dead on arrival, and passwords are never stored
tags: better-auth, delegated-auth, credentials
---

# A delegated login stores the upstream credential before the session

In `pikkuDelegatedAuth`, `options.storeCredential(user.id, identity)` runs before
`createSession`. The comment says: "without it every proxied call would fail, so
the sign-in must fail instead." A store failure returns `INTERNAL_SERVER_ERROR`
("Failed to store upstream credential") and no session is created.

Other rules here:

- **No password is stored.** The comment on the plugin says so. What persists is
  the upstream's own opaque credential, passed to the app's `storeCredential`.
- **The credential goes to the client never.** `UpstreamIdentity.credential` is
  "persisted ... never returned to the client."
- **The upstream login is forwarded, not kept.** `DelegatedCredentials` is passed to
  `authenticate` and is "never stored."

What the code does not do: the user row and the `delegated` account link are
written before `storeCredential` runs. If the store fails, those rows stay, and the
next sign-in finds the link. I did not check whether that is intended. It is
recorded in the code order, not in a comment.

**What this rules out:** a session for a user whose upstream calls cannot work,
and storing the password.
