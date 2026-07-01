import type { AuditEvent, AuditEventBatch, AuditService } from '@pikku/core'
import type { Kysely } from 'kysely'

const jsonOrNull = (v: unknown): string | null =>
  v != null ? JSON.stringify(v) : null

// No global `crypto` is guaranteed across every runtime, and audit_id is the
// PK — any collision is dropped by ON CONFLICT DO NOTHING.
const fallbackId = (): string =>
  `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

/**
 * Durable {@link AuditService} that persists AuditEvents to an `audit` table
 * via Kysely — the companion sink to {@link createAuditedKysely}.
 *
 * The column mapping mirrors Fabric's platform audit-queue consumer, so a
 * locally-run project and a deployed stage write identical rows (the read side
 * relies only on `type`, `occurred_at`, `actor_user_id`, and the `data` JSON
 * that holds `metadata`). The `audit` table is an optional per-project
 * migration (not in the generated schema), so rows are inserted untyped; all
 * columns are TEXT on every engine and ON CONFLICT DO NOTHING keeps writes
 * idempotent on retries.
 */
export class KyselyAuditService implements AuditService {
  constructor(private db: Kysely<any>) {}

  async audit(event: AuditEvent): Promise<void> {
    await this.write([event])
  }

  async write(batch: AuditEventBatch): Promise<void> {
    if (!batch.length) return
    const rows = batch.map((e) => {
      const metadata = e.metadata as
        | { tables?: unknown; changedColumns?: unknown }
        | undefined
      return {
        audit_id: e.eventId ?? e.queryId ?? fallbackId(),
        occurred_at: e.occurredAt ?? new Date().toISOString(),
        type: e.type ?? 'unknown',
        source: e.source ?? 'auto',
        outcome: e.outcome ?? null,
        function_id: e.functionId ?? null,
        wire_type: e.wireType ?? null,
        trace_id: e.traceId ?? null,
        transaction_id: e.transactionId ?? null,
        query_id: e.queryId ?? null,
        actor_user_id: e.actor?.userId ?? null,
        actor_org_id: e.actor?.orgId ?? null,
        tables: jsonOrNull(metadata?.tables),
        changed_cols: jsonOrNull(metadata?.changedColumns),
        event: e.eventId ?? null,
        old: null,
        data: jsonOrNull(e.metadata),
      }
    })
    await (this.db as any)
      .insertInto('audit')
      .values(rows)
      .onConflict((oc: any) => oc.doNothing())
      .execute()
  }
}
