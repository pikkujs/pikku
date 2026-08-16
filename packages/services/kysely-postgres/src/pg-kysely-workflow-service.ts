import { KyselyWorkflowService } from '@pikku/kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import type { WorkflowQueueOptions } from '@pikku/core/workflow'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export interface PgWorkflowQueueOptions extends WorkflowQueueOptions {
  /**
   * A second Kysely instance, on its own connection pool, used only to hold the
   * run lock. A Postgres advisory lock lives on a connection, and `withRunLock`
   * spans the whole workflow body — so without this, N concurrent runs occupy N
   * connections of the pool the rest of the app queries through, and at N =
   * pool size every other request queues forever behind them. Point this at a
   * small dedicated pool and that pool's size becomes the cap on concurrent
   * runs per process: run N+1 waits for a lock connection instead of starving
   * request serving.
   *
   * Size it above the deepest chain of runs that start each other inline — a
   * parent holding a lock connection while a child asks for one is a deadlock,
   * not a wait.
   *
   * It must connect to the same Postgres database as every other worker's lock
   * pool. `pg_advisory_xact_lock` is scoped to a database, so two workers whose
   * lock pools point at different databases never contend and the same run
   * executes twice.
   */
  lockDb?: Kysely<KyselyPikkuDB>
  /**
   * Milliseconds a run waits for the advisory lock itself, via `lock_timeout`,
   * once its transaction already holds a connection. `0` (the default) waits
   * forever, which is what a blocked run did before this option existed. Set it
   * to surface a jam as a failed run rather than a process that never finishes
   * one.
   *
   * It does not bound checking a connection out of `lockDb`: a saturated lock
   * pool still queues without a limit, which is the backpressure the pool is
   * there to apply.
   */
  lockTimeoutMs?: number
}

export class PgKyselyWorkflowService extends KyselyWorkflowService {
  private lockDb: Kysely<KyselyPikkuDB>
  private lockTimeoutMs: number

  constructor(db: Kysely<KyselyPikkuDB>, options: PgWorkflowQueueOptions = {}) {
    super(db, options)
    this.lockDb = options.lockDb ?? db
    const lockTimeoutMs = options.lockTimeoutMs ?? 0
    if (!Number.isFinite(lockTimeoutMs)) {
      throw new RangeError('lockTimeoutMs must be a finite number of ms')
    }
    this.lockTimeoutMs = Math.max(0, Math.trunc(lockTimeoutMs))
  }

  /**
   * Postgres has no `json_set`. The column is text, so it is cast to jsonb for
   * the merge and back afterwards; `||` is used rather than `jsonb_set` because
   * `jsonb_set` will not create a key that is not already present.
   *
   * The value is carried as text and only then cast to jsonb, so it lands as a
   * JSON value and not as a JSON string that happens to contain JSON. The
   * intermediate `::text` is what makes that true for every driver: postgres.js
   * infers a parameter's type from the cast that follows it and JSON-encodes
   * anything it believes is jsonb, so a bare `$1::jsonb` would arrive
   * double-encoded — `1` stored as `"1"`, and a counter read back as a string.
   */
  protected override jsonSetState(path: string, json: string) {
    // The base builds `$."key"`; Postgres addresses jsonb keys by bare name.
    const key = JSON.parse(path.slice(2))
    return sql<string>`(coalesce(state, '{}')::jsonb || jsonb_build_object(${key}::text, (${json}::text)::jsonb))::text`
  }

  /**
   * Safe to opt in: `withStepLock` below takes a real advisory lock, so the
   * relay's redundant dispatches lose the claim instead of executing twice.
   */
  protected override async findUndispatchedSteps(
    before: Date,
    limit: number
  ): Promise<Array<{ runId: string; stepId: string }>> {
    return this.queryUndispatchedSteps(before, limit)
  }

  private hashStringToInt(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash |= 0
    }
    return hash
  }

  /**
   * Held for the whole workflow body, so it runs on `lockDb` — see the option.
   */
  async withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const lockId = this.hashStringToInt(`run:${id}`)
    return this.lockDb.transaction().execute(async (trx) => {
      if (this.lockTimeoutMs > 0) {
        await sql
          .raw(`SET LOCAL lock_timeout = ${this.lockTimeoutMs}`)
          .execute(trx)
      }
      await sql`SELECT pg_advisory_xact_lock(${lockId})`.execute(trx)
      return fn()
    })
  }

  /**
   * Stays on the query pool: the caller only claims the step under this lock
   * and runs the step itself outside it, so the connection is held for a few
   * statements rather than for the step's work.
   */
  async withStepLock<T>(
    runId: string,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const lockId = this.hashStringToInt(`step:${runId}:${stepName}`)
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(${lockId})`.execute(trx)
      return fn()
    })
  }
}
