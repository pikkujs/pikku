---
type: decision
title: A scoped secret view reads only its declared keys and never writes
description: ScopedSecretService checks every read against an allowed-key set and refuses all writes, unlike the credential service that stays writable
tags: core, secrets, scoping
---

# A scoped secret view reads only its declared keys and never writes

`packages/core/src/services/scoped-secret-service.ts` wraps a `SecretService`
with a set of allowed keys (`scoped-secret-service.ts:4-8`).

Every read is checked first. `getSecret`, `hasSecret` and `getSecrets` each call
`assertAllowed`, which throws `Access denied to secret key` for any key outside
the set (`scoped-secret-service.ts:10-14`, `17`, `22`, `43`).

Every write is refused. `setSecret`, `setEncryptedSecret` and `deleteSecret`
throw unconditionally (`scoped-secret-service.ts:26-38`).

The credential counterpart is different. `scoped-credential-service.ts` says it
"stays writable — an addon refreshing its own OAuth token is the normal case"
(`scoped-credential-service.ts:6-8`).

**What this rules out:** an addon reading a secret it did not declare, and an
addon writing or deleting any secret through this view.
