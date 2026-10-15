---
type: decision
title: Virtual user upstream credentials are read from the environment on each sign-in
description: The credentials a virtual user carries are taken from VIRTUAL_USER_CREDENTIAL variables at every sign-in, stored per virtual user, and removed when the variable is gone
tags: better-auth, virtual-users, credentials
---

# Virtual user upstream credentials are read from the environment on each sign-in

When `pikkuVirtualUser` is given `credentials`, each successful virtual user
sign-in calls `storeVirtualUserCredentials` (`virtual-user-plugin.ts`). For each
declared credential name:

- The variable is `VIRTUAL_USER_CREDENTIAL_<VIRTUAL_USER>_<NAME>`, built by
  `virtualUserCredentialEnvKey` from the part of the address before `@` and the
  credential name. Both are uppercased, with non-alphanumerics turned to
  underscores. For example, `dan@virtualuser.local` plus `dolibarr` gives
  `VIRTUAL_USER_CREDENTIAL_DAN_DOLIBARR`.
- The value is read from `process.env`, or from the `read` option. A Worker passes
  its variables service.
- **Unset.** The credential is removed with `remove` if one was given, and nothing
  is stored. The stale value does not outlive the variable.
- **Set.** A JSON object is stored as is, anything else as `{ token }`. Malformed
  JSON fails the sign-in with an error that names the variable.

Only the names of the credentials stored are logged.

**What this rules out:** keeping an upstream secret from the environment after the
variable is removed, and putting upstream secrets into the session.
