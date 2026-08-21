import type { Kysely, Selectable } from 'kysely'
import { randomUUID } from 'node:crypto'
import type {
  StepRecord,
  VirtualUserDisposition,
} from '@pikku/core/virtual-user'
import type {
  VirtualUserRunOutcome,
  VirtualUserRunRecord,
  VirtualUserRunStart,
  VirtualUserRunStore,
} from '@pikku/core/virtual-user'
import type {
  KyselyPikkuDB,
  VirtualUserRunStepTable,
  VirtualUserRunTable,
} from './kysely-tables.js'
import { parseJson } from './kysely-json.js'
import { requirePikkuSchema } from './schema/index.js'
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
/**
 * How many step rows go in one insert.
 *
 * Not a performance dial. A bare SQLite driver binds at most 999 variables per
 * statement, and ten columns times a 500-step budget is five thousand — so an
 * un-chunked insert does not fail on a long run, it fails on the *interesting*
 * long run, which is the one nobody wants to lose.
 */
const STEP_INSERT_CHUNK = 50

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
    await requirePikkuSchema(this.db, virtualUserSchema)
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
    const updated = await this.db
      .updateTable('virtualUserRun')
      .set({
        status: 'completed',
        findings: JSON.stringify(outcome.findings),
        tally: JSON.stringify(outcome.tally),
        // Overwritten rather than merged: the engine's memory already carries
        // what it was given, plus what it learned on the way.
        memory: JSON.stringify(outcome.memory),
        intents: JSON.stringify(outcome.intents),
        stoppedBy: outcome.stoppedBy,
        finishedAt: new Date().toISOString(),
      })
      .where('runId', '=', runId)
      .executeTakeFirst()
    // Nothing owns steps written against a run that is not there, and nothing
    // would ever read or reap them — there is no foreign key to refuse them.
    if (updated.numUpdatedRows === 0n) return
    await this.writeSteps(runId, outcome.steps)
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

  async steps(
    runId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<StepRecord[]> {
    await this.init()
    const rows = await this.db
      .selectFrom('virtualUserRunStep')
      .selectAll()
      .where('runId', '=', runId)
      .orderBy('stepIndex', 'asc')
      .limit(options?.limit ?? 1000)
      .offset(options?.offset ?? 0)
      .execute()
    return rows.map((row) => this.toStep(row))
  }

  private async writeSteps(
    runId: string,
    steps: readonly StepRecord[]
  ): Promise<void> {
    for (let at = 0; at < steps.length; at += STEP_INSERT_CHUNK) {
      const chunk = steps.slice(at, at + STEP_INSERT_CHUNK)
      await this.db
        .insertInto('virtualUserRunStep')
        .values(
          chunk.map((step) => ({
            runId,
            stepIndex: step.index,
            intentId: step.intentId ?? null,
            action: JSON.stringify(step.action),
            status: step.status ?? null,
            ok: step.ok === undefined ? null : step.ok ? 1 : 0,
            response:
              step.response === undefined
                ? null
                : JSON.stringify(step.response),
            findingKinds: step.findingKinds
              ? JSON.stringify(step.findingKinds)
              : null,
            tokensIn: step.tokensIn,
            tokensOut: step.tokensOut,
          }))
        )
        .execute()
    }
  }

  private toStep(row: Selectable<VirtualUserRunStepTable>): StepRecord {
    return {
      index: Number(row.stepIndex),
      ...(row.intentId ? { intentId: row.intentId } : {}),
      action: parseJson(row.action),
      ...(row.status === null ? {} : { status: Number(row.status) }),
      ...(row.ok === null ? {} : { ok: Boolean(row.ok) }),
      ...(row.response === null ? {} : { response: parseJson(row.response) }),
      ...(row.findingKinds
        ? { findingKinds: parseJson(row.findingKinds) }
        : {}),
      tokensIn: Number(row.tokensIn),
      tokensOut: Number(row.tokensOut),
    }
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
      intents: parseJson(row.intents) ?? [],
      tally: row.tally ? (parseJson(row.tally) ?? null) : null,
      stoppedBy: row.stoppedBy,
      error: row.error,
      startedBy: row.startedBy,
      createdAt: new Date(row.createdAt),
      finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
    }
  }
}
