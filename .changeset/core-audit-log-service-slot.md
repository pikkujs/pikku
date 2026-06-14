---
"@pikku/core": patch
---

feat(core): add `auditLog` service slot for per-invocation audit logs

`CoreSingletonServices` now declares `auditLog?: AuditLog`, giving the
per-request audit log returned by `createInvocationAudit` a typed home in the
service container. Apps wire it in `createWireServices`
(`return { auditLog, kysely: createAuditedKysely(kysely, { audit: auditLog }) }`)
and the runner flushes its buffer via `close()` when the invocation ends.

Previously there was no slot to return it from: `audit` is typed `AuditService`
(the durable sink, `.audit()`), while `createInvocationAudit` returns an
`AuditLog` (the request-scoped buffer, `.write/.flush/.close`). Returning the
buffer under `audit` was a type error, so audited-Kysely wiring could not
type-check. `auditLog` is distinct from `audit` and never shadows it.
