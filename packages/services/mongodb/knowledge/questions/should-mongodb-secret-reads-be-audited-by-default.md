---
type: question
title: Should MongoDB secret reads be audited by default?
description: The MongoDB secret service leaves auditing off and reads unaudited, creates the audit index only when auditing is on, and records no row for bulk reads
tags: [audit, secrets, mongodb]
---

# Should MongoDB secret reads be audited by default?

`MongoDBSecretService` (`packages/services/mongodb/src/mongodb-secret-service.ts`)
defaults `audit` and `auditReads` to false (`mongodb-secret-service.ts:63-64`). The audit
index is created only when auditing is on (`mongodb-secret-service.ts:76-78`).
`logAudit` returns early when auditing is off, and for reads when `auditReads` is off
(`mongodb-secret-service.ts:87-88`).

A single `getSecret` records a read (`mongodb-secret-service.ts:135`). `getSecrets`
writes no audit row, even with auditing on (`mongodb-secret-service.ts:178-200`). Writes,
deletes and rotations are recorded when auditing is on (`mongodb-secret-service.ts:170`,
`:175`, `:227`).

Current behaviour: no read is recorded until the app turns auditing on, and bulk reads
are never recorded. The code does not say whether that is intended.

Open: should reads be audited by default, and should `getSecrets` record a row per key?
