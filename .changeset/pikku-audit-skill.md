---
'@pikku/cli': patch
---

Add the `pikku-audit` skill documenting the built-in audit runtime: the AuditService sink (Noop / KyselyAuditService / platform-injected), the per-invocation `auditLog` buffer via `createInvocationAudit` in `pikkuWireServices`, the `audit: true` function flag, explicit `auditLog.write()` domain events, and automatic query-level capture via `createAuditedKysely`.
