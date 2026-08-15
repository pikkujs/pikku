import type { Kysely, Selectable } from 'kysely'
import { randomUUID } from 'node:crypto'
import type { VirtualUserDisposition } from '@pikku/core/ecosystem/virtual-user'
import type {
  VirtualUserRunOutcome,
  VirtualUserRunRecord,
  VirtualUserRunStart,
  VirtualUserRunStore,
} from '@pikku/core/ecosystem/virtual-user'
import type { KyselyPikkuDB, VirtualUserRunTable } from './kysely-tables.js'
import { parseJson } from './kysely-json.js'
import { ensurePikkuSchema } from './schema/index.js'
import { virtualUserSchema } from './schema/virtual-user.schema.js'

/**
 * Records virtual-user runs in a `virtualUserRun` table.
 *
 * The store is the whole record of a run: `runVirtualUser` returns as soon as
 * the row exists and the engine keeps going without it, so nothing else knows
 * the run happened. That is why `fail()` exists as its own call — a run that
 * crashed and a run that found nothing are different answers, and a row left at
 * `running` is neither.
 *
 * Works with or without `SerializePlugin`, which not every project installs: the
 * JSON columns are written as strings (which the plugin passes through) and read
 * back through `parseJson` (which passes through what the plugin already
 * parsed). Timestamps are written as ISO strings for the same reason — a bare
 * SQLite driver cannot bind a `Date` at all.
 *
 * SECURITY: an `adversarial` run's findings are working exploits carrying live
 * ids. This is a privileged store; the scaffolded reads are scope-gated, and
 * exposing these rows more widely publishes your own exploits.
 */
export class KyselyVirtualUserRunStore implements VirtualUserRunStore {
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {}

  /**
   * Creates the table on first use, like the audit sink — the runtime does not
   * need it, so it arrives with the feature that fills it rather than in every
   * database.
   */
  public async init(): Promise<void> {
    if (this.initialized) return
    await ensurePikkuSchema(this.db, virtualUserSchema)
    this.initialized = true
  }

  async start(run: VirtualUserRunStart): Promise<string> {
    await this.init()
    const runId = randomUUID()
    await this.db
      .insertInto('virtualUserRun')
      .values({
        runId,
        persona: run.persona,
        disposition: run.disposition,
        // Text on every engine (see the schema), so the seed round-trips
        // through drivers that hand a BIGINT back as a string.
        seed: String(run.seed),
        status: 'running',
        goals: JSON.stringify(run.goals ?? []),
        memory: JSON.stringify(run.memory ?? {}),
        findings: '[]',
        startedBy: run.startedBy ?? null,
      })
      .execute()
    return runId
  }

  async complete(runId: string, outcome: VirtualUserRunOutcome): Promise<void> {
    await this.init()
    await this.db
      .updateTable('virtualUserRun')
      .set({
        status: 'completed',
        findings: JSON.stringify(outcome.findings),
        tally: JSON.stringify(outcome.tally),
        // Overwritten rather than merged: the engine's memory already carries
        // what it was given, plus what it learned on the way.
        memory: JSON.stringify(outcome.memory),
        stoppedBy: outcome.stoppedBy,
        finishedAt: new Date().toISOString(),
      })
      .where('runId', '=', runId)
      .execute()
  }

  async fail(runId: string, error: string): Promise<void> {
    await this.init()
    await this.db
      .updateTable('virtualUserRun')
      .set({
        status: 'failed',
        error,
        finishedAt: new Date().toISOString(),
      })
      .where('runId', '=', runId)
      .execute()
  }

  async get(runId: string): Promise<VirtualUserRunRecord | null> {
    await this.init()
    const row = await this.db
      .selectFrom('virtualUserRun')
      .selectAll()
      .where('runId', '=', runId)
      .executeTakeFirst()
    return row ? this.toRecord(row) : null
  }

  async list(options?: {
    persona?: string
    limit?: number
    offset?: number
  }): Promise<VirtualUserRunRecord[]> {
    await this.init()
    let query = this.db.selectFrom('virtualUserRun').selectAll()
    if (options?.persona) {
      query = query.where('persona', '=', options.persona)
    }
    const rows = await query
      .orderBy('createdAt', 'desc')
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0)
      .execute()
    return rows.map((row) => this.toRecord(row))
  }

  private toRecord(row: Selectable<VirtualUserRunTable>): VirtualUserRunRecord {
    return {
      runId: row.runId,
      persona: row.persona,
      disposition: row.disposition as VirtualUserDisposition,
      seed: Number(row.seed),
      status: row.status,
      goals: parseJson(row.goals) ?? [],
      memory: parseJson(row.memory) ?? {},
      findings: parseJson(row.findings) ?? [],
      tally: row.tally ? (parseJson(row.tally) ?? null) : null,
      stoppedBy: row.stoppedBy,
      error: row.error,
      startedBy: row.startedBy,
      createdAt: new Date(row.createdAt),
      finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
    }
  }
}
