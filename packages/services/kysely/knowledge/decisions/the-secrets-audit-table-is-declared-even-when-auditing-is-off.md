---
type: decision
title: The secrets audit table is declared even when auditing is off
description: secretsAudit is created by the secret migration unconditionally, because a migration cannot depend on runtime config and an unused table costs nothing
tags: [secrets, audit, migrations, kysely]
---

# The secrets audit table is declared even when auditing is off

`secretSchema` in `packages/services/kysely/src/schema/secret.schema.ts` creates the
`secretsAudit` table as one of its statements (`secret.schema.ts:39-47`), with no
condition on the audit setting. The comment gives the reason: a migration cannot depend
on runtime configuration, and an unused table costs nothing, while turning auditing on
against a database that never got the table fails on the first write
(`secret.schema.ts:7-11`).

Whether audit rows are written is a separate setting. `KyselySecretService` defaults
`audit` to false (`packages/services/kysely/src/kysely-secret-service.ts:42`), and its
`logAudit` returns early when auditing is off (`kysely-secret-service.ts:56`).

**What this rules out:** generating the audit table only when the service is configured
with auditing on, which would make the schema depend on runtime configuration.
