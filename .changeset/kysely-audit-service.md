---
'@pikku/kysely': minor
---

Add `KyselyAuditService` — a durable `AuditService` that persists AuditEvents to an `audit` table via Kysely (the companion sink to `createAuditedKysely`). Its column mapping matches Fabric's platform audit-queue consumer, so a locally-run project and a deployed stage produce identical rows. Use it as the local/dev audit sink so audit events persist and are queryable without the platform queue.
