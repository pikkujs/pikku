//~ name: audit-log
//~ title: Audit trail — record who changed what, and read it back
//~ when: The app has a real audit/compliance requirement (finance, healthcare, admin tooling, anything where "who changed this record" is a feature). NOT needed by default — do not add an audit table unless the brief asks for one.
//~ lang: ts

import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — add the table. The template does NOT ship one; audit is opt-in.
// Create db/sqlite/<next-free-number>-audit.sql (the files already in that
// directory show which numbers are taken — they must be consecutive and gap-free) with
// EXACTLY this DDL. The column names are fixed: the platform's audit service
// writes these columns by name, so renaming any of them silently drops the field.
//
//   CREATE TABLE IF NOT EXISTS audit (
//     audit_id       TEXT    NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
//     occurred_at    TEXT    NOT NULL DEFAULT (datetime('now')),
//     type           TEXT    NOT NULL,
//     source         TEXT    NOT NULL DEFAULT 'auto',
//     outcome        TEXT,
//     function_id    TEXT,
//     wire_type      TEXT,
//     trace_id       TEXT,
//     transaction_id TEXT,
//     query_id       TEXT,
//     actor_user_id  TEXT,
//     actor_org_id   TEXT,
//     tables         TEXT,  -- JSON array of table names touched
//     changed_cols   TEXT,  -- JSON array of changed column names
//     event          TEXT,  -- custom event label
//     old            TEXT,  -- JSON: previous values
//     data           TEXT   -- JSON: new values / event payload
//   );
//
//   CREATE INDEX IF NOT EXISTS idx_audit_occurred_at ON audit (occurred_at);
//   CREATE INDEX IF NOT EXISTS idx_audit_actor       ON audit (actor_user_id) WHERE actor_user_id IS NOT NULL;
//   CREATE INDEX IF NOT EXISTS idx_audit_function    ON audit (function_id)   WHERE function_id  IS NOT NULL;
//
// Then run `pikku db migrate` — it applies the migration and regenerates the schema types.
//
// ⚠️ THE `audit` TABLE HAS NO CRUD. Fabric writes it for you — there is no create,
// edit or delete screen for an audit row, and you must NEVER write
// `insertInto('audit')` / `updateTable('audit')` in a function. An audit trail the app
// can edit is not an audit trail. Rows arrive one of two ways, both below: `audit: true`
// on a function (automatic capture) or `auditLog.write(...)` (an explicit domain event).
// The only app-owned code that touches this table is a READ (step 3).
//
// ⚠️ READ THIS BEFORE YOU BUILD A UI ON IT — in the sandbox the audit SINK is a
// no-op. services.ts resolves `existingServices?.audit ?? new NoopAuditService()`:
// a DEPLOYED stage gets the platform's real sink injected, the sandbox does not.
// So the table stays EMPTY here no matter how many records you create. That is
// correct, not a bug. Do NOT "fix" it by rewriting the function, by inserting into
// `audit` by hand, or by hunting for the row in the UI — an audit screen that
// renders its empty state locally is DONE.
// ─────────────────────────────────────────────────────────────────────────────

//~ An audit trail readable by the people it audits is not one — so everything here is
//~ gated. The gate is a SCOPE (a capability that depends only on the session), NOT a
//~ role check: there is no `session.role`, and a hand-rolled `pikkuAuth` reading one
//~ does not typecheck. Pull the `wire-scope` scaffold FIRST — it declares the scope
//~ tree, and `auth-session` grants the scopes in mapSession. Scopes FAIL CLOSED: a
//~ `scopes: [...]` on a function whose scope nobody was granted 403s everyone,
//~ including the admin. Grant first, gate second.

// STEP 2 — turn capture on for the functions worth auditing. `audit: true` is what
// wraps kysely so every table write inside this function is recorded (old values,
// changed columns, actor). Put it on MUTATIONS that matter — approvals, deletions,
// permission and money changes — not on every list query.
export const updateInvoiceStatus = pikkuFunc({
  audit: true,
  expose: true,
  input: z.object({ invoiceId: z.string(), status: z.enum(['draft', 'approved', 'paid']) }),
  output: z.object({ invoiceId: z.string() }),
  scopes: ['admin:invoices:approve'], //~ the capability THIS action needs, not an audit scope
  func: async ({ kysely }, input) => {
    await kysely
      .updateTable('invoice')
      .set({ status: input.status })
      .where('invoiceId', '=', input.invoiceId)
      .execute()
    return { invoiceId: input.invoiceId }
  },
})

// A domain event the automatic capture can't infer ("this invoice was exported to
// the accountant") is written explicitly. `auditLog` is always injected, but write()
// only PERSISTS when this function set `audit: true` — without it, it warns and no-ops.
export const exportInvoice = pikkuFunc({
  audit: true,
  expose: true,
  input: z.object({ invoiceId: z.string() }),
  output: z.object({ ok: z.boolean() }),
  scopes: ['admin:invoices:export'],
  func: async ({ auditLog }, input, session) => {
    await auditLog.write({
      type: 'invoice.exported',
      source: 'explicit',
      metadata: { invoiceId: input.invoiceId, exportedBy: session.userId },
    })
    return { ok: true }
  },
})

// STEP 3 — read it back. Newest first, cursor-free (an audit screen is scanned, not
// paged deep). The read is its own capability — reading the trail is not the same
// privilege as performing the audited actions above.
export const listAuditEvents = pikkuFunc({
  expose: true,
  readonly: true,
  input: z.object({
    limit: z.number().int().min(1).max(200).default(50),
    actorUserId: z.string().optional(),
  }),
  output: z.object({
    events: z.array(
      z.object({
        auditId: z.string(),
        occurredAt: z.string(),
        type: z.string(),
        actorUserId: z.string().nullable(),
        tables: z.array(z.string()),
        changedCols: z.array(z.string()),
      }),
    ),
  }),
  scopes: ['admin:audit:read'],
  func: async ({ kysely }, input) => {
    let query = kysely
      .selectFrom('audit')
      .select(['auditId', 'occurredAt', 'type', 'actorUserId', 'tables', 'changedCols'])
      .orderBy('occurredAt', 'desc')
      .limit(input.limit)
    if (input.actorUserId) query = query.where('actorUserId', '=', input.actorUserId)
    const rows = await query.execute()

    // `tables` / `changed_cols` are stored as JSON text, so they arrive as strings.
    const parseList = (raw: string | null): string[] => (raw ? JSON.parse(raw) : [])
    return {
      events: rows.map((r) => ({
        auditId: r.auditId,
        occurredAt: r.occurredAt,
        type: r.type,
        actorUserId: r.actorUserId,
        tables: parseList(r.tables),
        changedCols: parseList(r.changedCols),
      })),
    }
  },
})
