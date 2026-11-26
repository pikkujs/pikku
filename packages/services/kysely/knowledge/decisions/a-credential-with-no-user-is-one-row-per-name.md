---
type: decision
title: A credential with no user is one row per name
description: The database enforces one app-wide credential per name by indexing COALESCE(user_id, ''), and the service maps a missing user to IS NULL
tags: [credentials, schema, kysely, uniqueness]
---

# A credential with no user is one row per name

`credentialSchema` in `packages/services/kysely/src/schema/credential.schema.ts` creates
a unique index `credentials_name_user_id_unique` on `(name, COALESCE(user_id, ''))`
(`credential.schema.ts:33-36`). Its comment says `user_id` is nullable and that two rows
with a null user must still collide on name, which is why the rule is an expression
index (`credential.schema.ts:7-9`).

`KyselyCredentialService.whereUserId` turns a call with no user into `userId IS NULL`
(`packages/services/kysely/src/kysely-credential-service.ts:118-122`), so `get`, `set`,
`has` and `delete` without a user all address that single row. `getUsersWithCredential`
and `getAllUsers` leave the null-user row out (`kysely-credential-service.ts:233-253`).

**What this rules out:** two app-wide rows for the same credential name, and treating a
null user as a distinct owner from every other null user.
