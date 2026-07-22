---
name: pikku-audit
description: >-
  Use when adding audit / activity-history / change-tracking to a Pikku app, or when a function
  needs to record who changed what. Covers the built-in AuditService sink, the per-invocation
  auditLog buffer (createInvocationAudit / pikkuWireServices), the `audit: true` function flag,
  explicit `auditLog.write()` domain events, automatic query-level capture via
  createAuditedKysely, and the durable KyselyAuditService sink. TRIGGER when: user asks for an
  audit log, change history, activity feed, "who did this", or a custom audit/history table; code
  uses auditLog, createInvocationAudit, createAuditedKysely, or AuditService. DO NOT TRIGGER when:
  user wants app logging/telemetry (use the logger) or DB migrations in general (use
  pikku-kysely).
installGroups: [core]
---

# Pikku Audit

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Check how services are wired (`services.ts`) and whether an `audit` table migration exists before adding audit calls.
2. NEVER hand-roll a custom `audit_log` / history table with direct `insertInto('audit_log')` calls. The framework owns audit. A bespoke table drifts from the runtime (missing actor/trace/wire context, hand-written CHECK constraints that reject valid events, no prod sink). Use the built-in path below.
3. Make the smallest source change: mark the function `audit: true`, inject `auditLog`, call `auditLog.write(...)`. Do not invent a new service.
4. Validate with `pikku all` (regenerates the service flags) then run the app / e2e.

## Mental model — two layers

- **`audit` (singleton `AuditService`)** — the durable **sink**. Write-only: `audit(event)` + optional `write(batch)`. Defaults to `NoopAuditService` (discards). Swap in a real sink to persist (see Sinks).
- **`auditLog` (wire service `AuditLog`)** — a per-invocation **buffer** built from the sink via `createInvocationAudit(audit, wire)`. `auditLog.write(input)` enriches each event with `functionId`, `wireType`, `traceId`, `occurredAt`, and `actor` (from the wire session) automatically, then flushes to the sink when the invocation ends.

An event only persists when the function opts in with **`audit: true`** — otherwise `auditLog` is a no-op that warns.

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
  return { auditLog: createInvocationAudit(services.audit, wire) }
})
```

`audit` and `auditLog` are already declared on `CoreSingletonServices` / `CoreServices`, so no type change is needed to inject them.

## Recording events — explicit domain events (default)

Mark the function `audit: true` and call `auditLog?.write(...)`. Domain history goes in `metadata`; the actor is derived from the session, so do NOT pass it manually.

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

For a **system/cron** function there is no session, so `actor` is simply absent (nulls out `actor_user_id`). Use `pikkuVoidFunc({ audit: true, func: async ({ auditLog }) => { ... } })` — the void/config form accepts `audit`.

Helper functions (in `lib/`) that record audit take `auditLog?: AuditLog` in their services arg and are passed it from a `audit: true` caller — never import a service.

Note: events buffer and flush on invocation close. For a write inside a DB transaction, call `auditLog.write()` **after** the transaction commits — the sink is not part of your `trx`, so only record committed state.

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
  actor_user_id  TEXT,
  actor_org_id   TEXT,
  tables         TEXT,  -- JSON: table names touched (auto capture)
  changed_cols   TEXT,  -- JSON: changed column names (auto capture)
  event          TEXT,  -- custom event label
  old            TEXT,  -- JSON: previous values
  data           TEXT   -- JSON: metadata / new values / event payload
);
```

`auditLog.write({ metadata })` lands in the `data` column. Read history back by filtering it (SQLite `json_extract`, Postgres `->>`):

```typescript
const rows = await kysely
  .selectFrom('audit')
  .leftJoin('user', 'user.id', 'audit.actorUserId')
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
  outcome?: string
  functionId?
  wireType?
  wireId?
  traceId?
  transactionId?
  queryId? // auto
  actor?: { userId?; orgId? } // auto from wire session
  input?: unknown
  metadata?: Record<string, unknown> // your domain payload
}
```

`auditLog.write()` takes `Omit<AuditEvent, 'occurredAt'>` — you only supply `type`, `source`, and `metadata` (and `actor` if overriding the session default).

## Do / Don't

- DO mark recording functions `audit: true`, inject `auditLog`, and call `auditLog.write({ type, source: 'explicit', metadata })`.
- DO let the actor come from the session — don't thread `userId` into metadata for the actor.
- DON'T create a custom `audit_log`/history table or `insertInto('audit_log')` by hand.
- DON'T annotate the function's I/O from audit; audit is a side channel, not part of `input`/`output`.
- DON'T write audit inside a DB transaction expecting rollback — record after commit.
