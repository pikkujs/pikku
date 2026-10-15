---
type: decision
title: An admin-created user is removed when its password cannot be linked
description: createAuthUser checks the password policy first and deletes the new user if the credential account write fails, because the two writes have no shared transaction
tags: better-auth, admin, accounts
---

# An admin-created user is removed when its password cannot be linked

`createAuthUser` (`admin-users.ts`) creates a user row and, when a password is
given, a `credential` account. There is no transaction across the two writes.

The rules, in order:

- **Email taken is refused.** The lookup is on the lowercased address.
- **A supplied password is checked even when empty.** The comment says `''` is "a
  password the caller chose, not an omitted one, and the account it would create
  can never be signed into." Length limits come from the configured policy.
- **A failed link deletes the user.** Without that, the caller keeps a passwordless
  user and every retry fails on the duplicate email. If the delete itself fails,
  the error names the stranded user id.

`setAuthUserPassword` covers the other direction. It creates a credential account
for someone who signed up through a social provider and never had one.

**What this rules out:** leaving a passwordless account behind after a failed
create, and accepting an empty password as "no password."
