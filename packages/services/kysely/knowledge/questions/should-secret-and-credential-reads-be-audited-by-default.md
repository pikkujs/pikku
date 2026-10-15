---
type: question
title: Should secret and credential reads be audited by default?
description: The Kysely secret and credential stores leave auditing off, leave reads unaudited unless asked, and the secret store never records bulk reads; the generic query audit goes the other way
tags: [audit, secrets, credentials, kysely]
---

# Should secret and credential reads be audited by default?

`KyselySecretService` (`packages/services/kysely/src/kysely-secret-service.ts`) defaults
`audit` and `auditReads` to false (`kysely-secret-service.ts:42-43`). `logAudit` returns
early when auditing is off, and for reads when `auditReads` is off
(`kysely-secret-service.ts:56-57`). A single `getSecret` records a read
(`kysely-secret-service.ts:129`). `getSecrets` records nothing, even with auditing on
(`kysely-secret-service.ts:178-209`). Writes, deletes and rotations are recorded when
auditing is on (`kysely-secret-service.ts:170`, `:175`, `:237`).

`KyselyCredentialService` (`packages/services/kysely/src/kysely-credential-service.ts`)
has the same defaults (`kysely-credential-service.ts:40-41`) and the same gate
(`kysely-credential-service.ts:50-56`). `get` records a read (`:140`), and `getAll`
records one row per credential, still under the same flag (`:207-230`, `:227`).

`createAuditedKysely` goes the other way. It skips selects only when `auditReads` is
explicitly `false` (`packages/services/kysely/src/create-audited-kysely.ts:196-198`), so
database selects are audited by default.

Current behaviour: secret and credential reads leave no record until the app turns
auditing on, and bulk secret reads never leave one. The code does not say whether that is
meant.

Open: should secret and credential reads be audited by default, and should `getSecrets`
record a row per key? The files do not say.
