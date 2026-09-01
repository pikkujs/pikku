# Pikku Audit


## Mental model — two layers

- **`audit` (singleton `AuditService`)** — the durable **sink**. Write-only: `audit(event)` + optional `write(batch)`. Defaults to `NoopAuditService` (discards). Swap in a real sink to persist (see Sinks).
- **`auditLog` (wire service `AuditLog`)** — a per-invocation **buffer** built from the sink via `createInvocationAudit(audit, wire)`. `auditLog.write(input)` enriches each event with `functionId`, `wireType`, `traceId`, `occurredAt`, and `userIdentity` (from the wire session) automatically, then flushes to the sink when the invocation ends.

An event only persists when the function opts in with **`audit: true`** — otherwise `auditLog` is a no-op that warns once per invocation, naming the function that dropped the write.

`audit` also takes a config object, `{ durability: 'best-effort' | 'transactional' }`, and `audit: true` is shorthand for `'best-effort'`. Best-effort buffers events and flushes them when the invocation closes, swallowing sink failures with a warning — the function's result is never held hostage to the audit sink. `'transactional'` awaits the sink on every `write()` instead, so a sink failure fails the invocation. Reach for it only when losing the record is worse than failing the call.

## Wiring (services.ts)

```typescript
import { NoopAuditService, createInvocationAudit } from '@pikku/core/services'

export const createSingletonServices = pikkuServices(
  async (config, existing) => {
    // Prod platforms may inject a queue-backed sink as existing.audit.
    const audit = existing?.audit ?? new NoopAuditService()
    return { ...existing, config, /* ... */ audit }
  }
)

// auditLog is created per invocation from the sink. Returned unconditionally so
// a write from a function that forgot `audit: true` warns instead of vanishing.
export const createWireServices = pikkuWireServices(async (services, wire) => {
  if (!services.audit) return {}
  return {
    auditLog: createInvocationAudit(services.audit, wire, services.logger),
  }
})
```

The optional third argument is the fallback logger for the dropped-write warning
and for best-effort flush failures. Without it those messages only surface when
the wire happens to carry a logger, which is how a missing `audit: true` goes
unnoticed.

`audit` and `auditLog` are already declared on `CoreSingletonServices` / `CoreServices`, so no type change is needed to inject them.

## Recording events — explicit domain events (default)

Mark the function `audit: true` and call `auditLog?.write(...)`. Domain history goes in `metadata`; the user identity is derived from the session, so do NOT pass it manually.

```typescript
export const cancelInvoice = pikkuFunc({
  audit: true, // REQUIRED — else write() is a no-op
  input: CancelInvoiceInput,
  output: CancelInvoiceOutput,
  func: async ({ kysely, auditLog }, { invoiceId }, { session }) => {
    const inv = await kysely
      .selectFrom('invoice') /* ... */
      .executeTakeFirstOrThrow()
    await kysely
      .updateTable('invoice')
      .set({ status: 'cancelled' }) /* ... */
      .execute()

    await auditLog?.write({
      type: 'invoice.update',
      source: 'explicit',
      metadata: {
        entity: 'invoice',
        entityId: invoiceId,
        action: 'update',
        field: 'status',
        before: inv.status,
        after: 'cancelled',
      },
    })
    return { ok: true }
  },
})
```

For a **system/cron** function there is no session, so `userIdentity` is simply absent (nulls out `user_id`). Use `pikkuVoidFunc({ audit: true, func: async ({ auditLog }) => { ... } })` — the void/config form accepts `audit`.

Helper functions (in `lib/`) that record audit take `auditLog?: AuditLog` in their services arg and are passed it from a `audit: true` caller — never import a service.

Note: events buffer and flush on invocation close. For a write inside a DB transaction, call `auditLog.write()` **after** the transaction commits — the sink is not part of your `trx`, so only record committed state.

`write` is `Safe<>`-guarded the way the logger is: `input` and `metadata` are `unknown`, so a `SecretValue` nested anywhere in the event collapses the call to `never` and it stops compiling. An unrevealed secret would serialize as `[secret]` regardless — the guard just makes putting one in an audit row a decision rather than an accident. Reveal it explicitly if you genuinely mean to record it.

## Recording events — automatic query capture (optional)

To audit every DB mutation without explicit calls, wrap kysely so each query emits an event. Note this captures table/column changes only — it cannot see semantic events that do no DB write (e.g. "email sent"), so combine with explicit writes when you need those.

```typescript
import { createAuditedKysely } from '@pikku/kysely'
export const createWireServices = pikkuWireServices(async (services, wire) => {
  if (!services.audit) return {}
  const auditLog = createInvocationAudit(services.audit, wire)
  return {
    auditLog,
    kysely: createAuditedKysely(services.kysely, { audit: auditLog }),
  }
})
```

It is a Kysely plugin, so it wraps the instance rather than replacing it. Only
mutations are captured by default; `auditReads: true` adds selects, which is
usually far more volume than it is worth. `eventType`, `transactionId` and
`queryIdPrefix` are also accepted for labelling the emitted events.

## Sinks

- **`NoopAuditService`** (`@pikku/core/services`) — default; discards events. Fine when audit isn't needed.
- **`KyselyAuditService`** (`@pikku/kysely`) — durable: persists events to an `audit` table via kysely. Use as the local/dev sink so events are queryable without a platform queue: `new KyselyAuditService(kysely)`.
- **Platform-injected sink** — a deploy platform may inject its own queue-backed `audit` (hence the `existing?.audit ??` fallback above). Its rows land in the same `audit` table shape.

### The `audit` table (add this migration if you persist audit)

```sql
CREATE TABLE IF NOT EXISTS audit (
  audit_id       TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  occurred_at    TEXT NOT NULL DEFAULT (datetime('now')),
  type           TEXT NOT NULL,
  source         TEXT NOT NULL DEFAULT 'auto',
  outcome        TEXT,
  function_id    TEXT,
  wire_type      TEXT,
  trace_id       TEXT,
  transaction_id TEXT,
  query_id       TEXT,
  user_id        TEXT,
  org_id         TEXT,
  pikku_user_id  TEXT,
  tables         TEXT,  -- JSON: table names touched (auto capture)
  changed_cols   TEXT,  -- JSON: changed column names (auto capture)
  event          TEXT,  -- custom event label
  old            TEXT,  -- JSON: previous values
  data           TEXT   -- JSON: metadata / new values / event payload
);
```

The defaults above are SQLite; on Postgres swap them for `gen_random_uuid()::text` and `now()::text`. Every column stays TEXT on every engine so a locally-run project and a deployed stage write identical rows, and the sink inserts with `ON CONFLICT DO NOTHING` so a retried flush is idempotent.

`auditLog.write({ metadata })` lands in the `data` column. Read history back by filtering it (SQLite `json_extract`, Postgres `->>`):

```typescript
const rows = await kysely
  .selectFrom('audit')
  .leftJoin('user', 'user.id', 'audit.userId')
  .where(sql<boolean>`json_extract(audit.data, '$.entity') = 'invoice'`)
  .where(sql<boolean>`json_extract(audit.data, '$.entityId') = ${invoiceId}`)
  .orderBy('audit.occurredAt', 'desc')
  .select([
    'audit.auditId',
    sql<string>`json_extract(audit.data, '$.action')`.as('action'),
    'audit.occurredAt as at',
    'user.name as userName',
  ])
  .execute()
```

## AuditEvent shape

```typescript
type AuditEvent = {
  type: string // e.g. 'invoice.update'
  source: 'auto' | 'explicit'
  occurredAt: string // auto-filled by auditLog
  eventId?: string
  outcome?: 'success' | 'failed' | 'denied'
  functionId?
  wireType?
  wireId?
  traceId?
  transactionId?
  queryId? // auto
  userIdentity?: { userId?; orgId?; pikkuUserId? } // auto from wire session
  input?: unknown
  metadata?: Record<string, unknown> // your domain payload
}
```

`auditLog.write()` takes `Omit<AuditEvent, 'occurredAt'>` — you only supply `type`, `source`, and `metadata` (and `userIdentity` if overriding the session default).

`userIdentity` is filled from the wire's session plus its `pikkuUserId`, and is left off entirely when all three are absent — which is what makes a cron or system invocation land with a null actor rather than an empty object.

## Do / Don't

- DO mark recording functions `audit: true`, inject `auditLog`, and call `auditLog.write({ type, source: 'explicit', metadata })`.
- DO let the user identity come from the session — don't thread `userId` into metadata for it.
- DON'T create a custom `audit_log`/history table or `insertInto('audit_log')` by hand.
- DON'T annotate the function's I/O from audit; audit is a side channel, not part of `input`/`output`.
- DON'T write audit inside a DB transaction expecting rollback — record after commit.
