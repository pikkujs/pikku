---
type: decision
title: An admin sets a user's password out of band under admin:users:password
description: set-user-password writes a password directly for a named user, enforcing the length bounds, and creates a credential account for a user who has none
tags: admin, users, password
---

# An admin sets a user's password out of band under admin:users:password

`packages/addon/pikku-admin/src/functions/set-user-password.function.ts` declares
`scopes: ['admin:users:password']` (`set-user-password.function.ts:10`). Its
description says it sets a password "for when they cannot complete a reset
themselves," and that it gives a user who only ever signed in socially a credential
account (`set-user-password.function.ts:7-8`). The function calls
`setAuthUserPassword(auth, { userId, newPassword })` (`set-user-password.function.ts:14`).

The behaviour is in `packages/services/better-auth/src/admin-users.ts`:

- The length bounds are checked first, by `assertPasswordLength` at line 130. That
  helper is at lines 51-59.
- A missing user is refused with `User not found` (`admin-users.ts:131-133`).
- The password is hashed (`admin-users.ts:135`). If the user already has a
  `credential` account, the password is updated (`admin-users.ts:145`). If not, a
  `credential` account is created (`admin-users.ts:146-153`).

The function does not send any mail. Nothing in `admin-users.ts:125-155` calls a
mailer.

**What this rules out:** an admin password change that waits for the user to
complete a reset, and a social-only user who cannot be given a credential.
