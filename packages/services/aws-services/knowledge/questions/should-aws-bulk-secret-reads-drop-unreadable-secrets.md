---
type: question
title: Should AWS bulk secret reads drop secrets they cannot read?
description: AWSSecrets.getSecrets omits any key whose read fails for any reason, while the Kysely secret store throws on an unreadable secret and the core decision names only the Kysely, MongoDB and Redis stores
tags: [secrets, aws, errors]
---

# Should AWS bulk secret reads drop secrets they cannot read?

`AWSSecrets.getSecrets` (`packages/services/aws-services/src/aws-secrets.ts`) reads every
key with `Promise.allSettled` and copies only the fulfilled ones into the result
(`aws-secrets.ts:59-69`). A key whose read fails for any reason is therefore absent from
the result, with no error. The file has no comment on this.

Elsewhere in the same file, `getSecret` rewraps every error as `FATAL: Error finding secret`
(`aws-secrets.ts:33-36`), and `hasSecret` returns false on any error (`aws-secrets.ts:40-49`).

The Kysely secret store does the opposite for bulk reads. It throws when a stored secret
fails to decrypt, and its comment says swallowing that "produces an undefined secret and an
opaque downstream failure" (`packages/services/kysely/src/kysely-secret-service.ts:194-205`).
The core decision `packages/core/knowledge/decisions/internals/a-secret-that-fails-to-decrypt-fails-the-whole-read.md`
names the Kysely, MongoDB and Redis stores as applying that rule to bulk reads (line 10).

Current behaviour: an AWS bulk read hides an unreadable secret, whether it is missing,
denied or unreachable.

Open: is a secret that AWS cannot return meant to be silently absent from a bulk read? The
code does not say, and the core decision does not list AWS.
