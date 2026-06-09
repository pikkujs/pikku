---
"@pikku/core": patch
"@pikku/kysely": patch
---

Add audit logging support for function invocations and database queries.

Introduces `AuditService` and `createAuditedKysely` — configurable audit capture with best-effort and transactional durability modes. Audit logs capture session metadata (user, org), RPC call details, and Kysely query operations (type, tables, changes). Audit context is scoped per-invocation so nested RPC calls are correctly attributed.
