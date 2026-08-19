import { KyselyWorkflowService } from '@pikku/kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import type { WorkflowQueueOptions } from '@pikku/core/workflow'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import { jsonbText } from './jsonb.js'

export interface PgWorkflowQueueOptions extends WorkflowQueueOptions {
  /**
   * A dedicated pool for the run lock, which is held for the whole workflow
   * body. Its size caps concurrent runs per process; size it above the deepest
   * chain of runs that start each other inline, or a parent waiting on a child
   * deadlocks. Every worker's lock pool must point at the same database —
   * `pg_advisory_xact_lock` is database-scoped, so pools on different databases
   * never contend and the same run executes twice. Defaults to `db`.
   */
  lockDb?: Kysely<KyselyPikkuDB>
  /**
   * `lock_timeout` for the advisory lock, so a jam surfaces as a failed run.
   * `0` (the default) waits forever. Does not bound checking a connection out
   * of `lockDb` — that queue is the backpressure the pool exists to apply.
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
   * `jsonbText` is what carries the value safely across drivers — see its own
   * documentation for why a bare `$1::jsonb` would arrive double-encoded.
   */
  protected override jsonSetState(path: string, json: string) {
    // The base builds `$."key"`; Postgres addresses jsonb keys by bare name.
    const key = JSON.parse(path.slice(2))
    return sql<string>`(coalesce(state, '{}')::jsonb || jsonb_build_object(${key}::text, ${jsonbText(json)}))::text`
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
   * Stays on the query pool: the caller claims the step under this lock and
   * runs it outside, so the connection is held for a few statements.
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
