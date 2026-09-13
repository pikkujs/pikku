import type { AnalyticsRecord, AnalyticsService } from '@pikku/core/analytics'
import type { Kysely } from 'kysely'
import { requirePikkuSchema } from './schema/index.js'
import { analyticsSchema } from './schema/analytics.schema.js'

const jsonOrNull = (value: unknown): string | null =>
  value != null ? JSON.stringify(value) : null

/**
 * The primary key. `AnalyticsRecord` carries no id, so every row is given one
 * here, and a whole batch is minted inside one millisecond — a timestamp with
 * a short random tail would collide and `doNothing()` would drop the loser
 * without a word. `randomUUID` where the runtime has it, a 128-bit random hex
 * where it does not.
 */
const eventId = (): string => {
  const c: Crypto | undefined = globalThis.crypto
  if (typeof c?.randomUUID === 'function') {
    return `ana_${c.randomUUID()}`
  }
  if (typeof c?.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16))
    return `ana_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
  }
  return `ana_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/**
 * A durable {@link AnalyticsService} that appends events to a table pikku owns.
 *
 * The destination of last resort, and the one a project gets for free: without
 * it an app that declares events either wires a vendor sink or watches them go
 * to the logger, and neither is somewhere you can answer a question from. It is
 * append-only by design — there is no read side here, because querying events
 * is what a warehouse or the console does with the rows, not what the ingest
 * path needs.
 *
 * Every column is text on every engine, so the same table reads the same
 * whether it was filled by a locally-run project or a deployed stage. Names are
 * written camelCase, as the declaration spells them, and `CamelCasePlugin`
 * turns both into the physical snake_case the migration created.
 */
export class KyselyAnalyticsService implements AnalyticsService {
  private initialized = false

  constructor(private db: Kysely<any>) {}

  /**
   * Refuse to start unless the table is already there.
   *
   * Never creates it: `pikku db generate` writes the migration and `pikku db
   * migrate` applies it, and those are the only authors of this table.
   */
  public async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, analyticsSchema)
    this.initialized = true
  }

  async write(batch: AnalyticsRecord[]): Promise<void> {
    if (!batch.length) return
    const rows = batch.map((record) => ({
      eventId: eventId(),
      name: record.name,
      occurredAt: record.occurredAt ?? new Date().toISOString(),
      source: record.source ?? 'server',
      functionId: record.functionId ?? null,
      wireType: record.wireType ?? null,
      traceId: record.traceId ?? null,
      userId: record.userIdentity?.userId ?? null,
      orgId: record.userIdentity?.orgId ?? null,
      pikkuUserId: record.userIdentity?.pikkuUserId ?? null,
      anonymousId: record.userIdentity?.anonymousId ?? null,
      vendorIds: jsonOrNull(record.userIdentity?.vendorIds),
      consent: jsonOrNull(record.userIdentity?.consent),
      props: jsonOrNull(record.props),
    }))
    await (this.db as any)
      .insertInto('pikkuAnalyticsEvents')
      .values(rows)
      .onConflict((oc: any) => oc.doNothing())
      .execute()
  }
}
