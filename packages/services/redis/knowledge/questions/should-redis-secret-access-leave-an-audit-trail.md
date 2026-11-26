---
type: question
title: Should Redis secret access leave an audit trail?
description: The Redis secret service has no audit option and records no read, write, delete or rotation, unlike the Kysely and MongoDB secret services
tags: [audit, secrets, redis]
---

# Should Redis secret access leave an audit trail?

`RedisSecretServiceConfig` (`packages/services/redis/src/redis-secret-service.ts:13-18`)
has no audit setting. None of the methods in the file writes an audit record. `getSecret`
reads and decrypts (`redis-secret-service.ts:97-105`), `setSecret` writes
(`:112-125`), `deleteSecret` removes (`:127-129`), `getSecrets` reads in bulk
(`:131-160`), and `rotateKEK` rewraps every row (`:162-203`). The package contains no
audit reference at all.

The Kysely and MongoDB secret services both have an audit option and record writes,
deletes and rotations when it is on (`packages/services/kysely/src/kysely-secret-service.ts:21`,
`packages/services/mongodb/src/mongodb-secret-service.ts:17`).

Current behaviour: secret reads, writes, deletes and KEK rotations leave no record in
this store.

Open: should the Redis store record access at all, and if so, is that meant to be an
option like the other two stores? The code does not say.
