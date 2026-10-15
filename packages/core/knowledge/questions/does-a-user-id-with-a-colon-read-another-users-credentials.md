---
type: question
title: Can a user id containing a colon read another user's credentials?
description: LocalCredentialService joins user id and name with a colon and matches users by prefix, so an id containing a colon may collide with another user's keys
tags: core, credentials, local-dev, isolation
---

# Can a user id containing a colon read another user's credentials?

`packages/core/src/services/local-credential-service.ts` stores each credential
under the key `userId:name`, or just `name` when there is no user
(`local-credential-service.ts:6-8`).

`getAll(userId)` returns every key that starts with `${userId}:`, and strips that
prefix to get the credential name (`local-credential-service.ts:31-39`). If one
user's id contains a colon, its keys also start with the prefix of the id before
the colon. For example, user `a` would list the key of user `a:b`, credential `c`
(stored as `a:b:c`), under the name `b:c`.

`getUsersWithCredential` (`local-credential-service.ts:42-51`) and `getAllUsers`
(`local-credential-service.ts:53-62`) both split on the first colon, so they would
report user `a:b` as `a`.

Nothing in this file validates a user id. What is asked: can a user id contain a
colon in practice? If it can, is a user with id `a` meant to see keys belonging
to `a:b`? The code currently allows it, and no comment or test in this file says
which is intended.
