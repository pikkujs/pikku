---
type: question
title: Should admin credential scopes reach any user's credential by a caller-supplied user id?
description: The credential admin functions read, write, delete and enumerate per-user credentials by a userId the caller supplies, gated only by admin:credentials scopes, and no comment says that reach is intended
tags: admin, credentials, scopes
---

# Should admin credential scopes reach any user's credential by a caller-supplied user id?

Six functions in `packages/addon/pikku-admin/src/functions/` take an optional
`userId` from the caller and act on that user's credential. Each is gated only by
a scope; none checks that the target user is the caller.

- `credentialGet` returns the stored value as it is, for any `userId`, to a holder
  of `admin:credentials:read` (`credential-get.function.ts:10`, `:12-13`).
- `credentialSet` writes a value for any `userId`, gated by
  `admin:credentials:manage` (`credential-set.function.ts:10`, `:12`).
- `credentialDelete` deletes one for any `userId`, gated by
  `admin:credentials:manage` (`credential-delete.function.ts:10`, `:12`).
- `credentialStatus` reports whether each named credential is set for any `userId`,
  gated by `admin:credentials:read` (`credential-status.function.ts:11`, `:14-16`).
- `credentialUsers` lists every user id that holds a named credential, gated by
  `admin:credentials:read` (`credential-users.function.ts:10`, `:12-13`).
- `credentialListUsers` lists every user and the credential names each holds, gated
  by `admin:credentials:read` (`credential-list-users.function.ts:23`, `:30-36`).

The one comment in this set, on `credentialListUsers`, explains how the result is
keyed: by the credentials each user holds, not the declared set
(`credential-list-users.function.ts:8-14`). It does not say why an admin should
read or change another user's secret value.

Open: is it intended that a holder of an admin credential scope can read the raw
value of a per-user credential, and not only the app-level one? The code treats
both the same way.
