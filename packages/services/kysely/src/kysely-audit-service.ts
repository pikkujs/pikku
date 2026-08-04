import type {
  AuditEvent,
  AuditEventBatch,
  AuditFacets,
  AuditQuery,
  AuditQueryResult,
  AuditService,
} from '@pikku/core'
import type { Kysely } from 'kysely'
import { ensurePikkuSchema } from './schema/index.js'
import { auditSchema } from './schema/audit.schema.js'

const jsonOrNull = (v: unknown): string | null =>
  v != null ? JSON.stringify(v) : null

const parseJson = (v: unknown): any => {
  if (typeof v !== 'string') return v ?? undefined
  try {
    return JSON.parse(v)
  } catch {
    // A row written by something other than this service, or truncated in
    // transit. Surfacing the raw text beats dropping the event: the row is
    // still evidence that something happened, and swallowing it would make the
    // trail quietly incomplete.
    return v
  }
}

/**
 * A column by its physical name, whatever the connection renamed it to.
 *
 * `CamelCasePlugin` is on most pikku Kysely instances and rewrites result keys
 * on the way out, so the same row arrives keyed `audit_id` or `auditId`
 * depending on a plugin this service is never told about. Reading both is
 * cheaper than demanding a particular connection — and quieter to get wrong,
 * since the mismatch does not throw, it just returns a page of undefined.
 */
const column = (row: Record<string, any>, name: string): any => {
  const value = row[name]
  if (value !== undefined) return value
  return row[name.replace(/_(\w)/g, (_, char: string) => char.toUpperCase())]
}

/** Rows are TEXT on every engine, so the shape is whatever the driver returned. */
const rowToEvent = (row: Record<string, any>): AuditEvent => {
  const userId = column(row, 'user_id')
  const orgId = column(row, 'org_id')
  const pikkuUserId = column(row, 'pikku_user_id')
  return {
    eventId: column(row, 'audit_id') ?? undefined,
    occurredAt: column(row, 'occurred_at'),
    type: row.type,
    source: row.source ?? 'auto',
    outcome: row.outcome ?? undefined,
    functionId: column(row, 'function_id') ?? undefined,
    wireType: column(row, 'wire_type') ?? undefined,
    traceId: column(row, 'trace_id') ?? undefined,
    transactionId: column(row, 'transaction_id') ?? undefined,
    queryId: column(row, 'query_id') ?? undefined,
    userIdentity:
      userId || orgId || pikkuUserId
        ? {
            userId: userId ?? undefined,
            orgId: orgId ?? undefined,
            pikkuUserId: pikkuUserId ?? undefined,
          }
        : undefined,
    metadata: parseJson(row.data),
  }
}

/** The most a single page may return, whatever the caller asked for. */
const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50

// No global `crypto` is guaranteed across every runtime, and audit_id is the
// PK — any collision is dropped by ON CONFLICT DO NOTHING.
const fallbackId = (): string =>
  `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

/**
 * Durable {@link AuditService} that persists AuditEvents to an `audit` table
 * via Kysely — the companion sink to {@link createAuditedKysely}.
 *
 * The column mapping matches a platform audit-queue consumer, so a locally-run
 * project and a deployed stage write identical rows (the read side relies only
 * on `type`, `occurred_at`, `user_id`, and the `data` JSON that holds
 * `metadata`). The `audit` table is an optional per-project migration (not in
 * the generated schema), so rows are inserted untyped; all columns are TEXT on
 * every engine and ON CONFLICT DO NOTHING keeps writes idempotent on retries.
 */
export class KyselyAuditService implements AuditService {
  private initialized = false

  constructor(private db: Kysely<any>) {}

  /**
   * Creates the `audit` table if the database has none.
   *
   * Optional — a project that migrates the table itself can skip it, and the
   * declaration is written to match the documented shape either way. Calling it
   * on a database that already has the table is a no-op, so two instances
   * booting cold do not race each other into a half-applied schema.
   */
  public async init(): Promise<void> {
    if (this.initialized) return
    await ensurePikkuSchema(this.db, auditSchema)
    this.initialized = true
  }

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
        user_id: e.userIdentity?.userId ?? null,
        org_id: e.userIdentity?.orgId ?? null,
        pikku_user_id: e.userIdentity?.pikkuUserId ?? null,
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

  /**
   * A page of the trail, newest first.
   *
   * Offset paging, matching the rest of the console. The trail is append-only
   * and ordered by `occurred_at DESC`, so events written *while* a reader is
   * paging shift the window and can repeat a row across pages. That is visible
   * but harmless for browsing; anything that must not miss a row should page by
   * a bounded `from`/`to` window instead of scrolling.
   *
   * Ties on `occurred_at` are broken by `audit_id` so the order is total —
   * without it a batch flushed in one call shares a timestamp and the engine is
   * free to order it differently per query, which drops or repeats rows at a
   * page boundary.
   */
  async query(query: AuditQuery = {}): Promise<AuditQueryResult> {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
    const offset = Math.max(query.offset ?? 0, 0)

    let builder = (this.db as any).selectFrom('audit').selectAll()
    builder = this.applyFilters(builder, query)

    const rows = await builder
      .orderBy('occurred_at', 'desc')
      .orderBy('audit_id', 'desc')
      // One extra row is the cheapest honest way to know whether another page
      // exists — a COUNT would be a second scan of the same filter.
      .limit(limit + 1)
      .offset(offset)
      .execute()

    const hasMore = rows.length > limit
    return {
      events: rows.slice(0, limit).map(rowToEvent),
      nextCursor: hasMore ? offset + limit : null,
    }
  }

  async facets(): Promise<AuditFacets> {
    const [users, types] = await Promise.all([
      (this.db as any)
        .selectFrom('audit')
        .select('user_id')
        .distinct()
        .where('user_id', 'is not', null)
        .orderBy('user_id', 'asc')
        .execute(),
      (this.db as any)
        .selectFrom('audit')
        .select('type')
        .distinct()
        .orderBy('type', 'asc')
        .execute(),
    ])
    return {
      userIds: users.map((r: any) => column(r, 'user_id')),
      types: types.map((r: any) => r.type).filter(Boolean),
    }
  }

  /**
   * An empty array means "match nothing" and is applied as such. Treating it as
   * "no filter" would turn a reader's deselect-everything into a full-trail
   * read, which is the opposite of what they asked for.
   */
  private applyFilters(builder: any, query: AuditQuery): any {
    // `in ()` is a syntax error on Postgres and SQLite alike, so an empty
    // selection is expressed as a predicate that cannot hold.
    const matchNothing = (b: any) => b.where('audit_id', 'is', null)

    if (query.userIds) {
      builder = query.userIds.length
        ? builder.where('user_id', 'in', query.userIds)
        : matchNothing(builder)
    }
    if (query.types) {
      builder = query.types.length
        ? builder.where('type', 'in', query.types)
        : matchNothing(builder)
    }
    if (query.orgId) {
      builder = builder.where('org_id', '=', query.orgId)
    }
    if (query.from) {
      builder = builder.where('occurred_at', '>=', query.from)
    }
    if (query.to) {
      builder = builder.where('occurred_at', '<', query.to)
    }
    return builder
  }
}
