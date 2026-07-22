# Audit Wire Service

`createInvocationAudit` creates a per-request `InvocationAuditLog` that buffers audit events in memory and flushes them as a batch when the function-runner calls `closeWireServices` at the end of the request. If `singletonServices.audit` is not configured (local dev without Fabric), it returns a no-op `DisabledInvocationAudit` — no crash, events are silently dropped.

Pair with `createAuditedKysely` to auto-capture every Kysely query as an audit event.

```typescript
// services.ts
import { createInvocationAudit } from '@pikku/core/services'
import { createAuditedKysely } from '@pikku/kysely'

export const createWireServices = pikkuWireServices(
  async (singletonServices, wire) => {
    const audit = createInvocationAudit(singletonServices.audit, wire)
    const kysely = singletonServices.kysely
      ? createAuditedKysely(singletonServices.kysely, { audit })
      : undefined
    return { audit, ...(kysely ? { kysely } : {}) }
  }
)
```

The `audit` wire service is typed as `AuditLog` (from `@pikku/core`). Functions that emit custom events use it directly:

```typescript
const deleteUser = pikkuFunc({
  func: async ({ audit }, { userId }) => {
    await audit.audit({ type: 'user.deleted', actor_user_id: userId })
    // ...
  },
})
```

`closeWireServices` (called automatically by the function-runner) invokes `audit.close()` → `singletonServices.audit.write(batch)` → platform-specific flush (e.g. CF Queue, libsql INSERT). No manual flushing needed.

> **Fabric note:** Fabric provisions the audit queue and consumer worker automatically. The audit table schema is in `db/sqlite/0003-audit.sql` (starter-template). Run `pikku fabric validate` to confirm the migration is in place.
