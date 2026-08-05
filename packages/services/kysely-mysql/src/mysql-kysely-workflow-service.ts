import { KyselyWorkflowService } from '@pikku/kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export class MySQLKyselyWorkflowService extends KyselyWorkflowService {
  private lockTimeout: number

  constructor(db: Kysely<KyselyPikkuDB>, lockTimeout = 10) {
    super(db)
    this.lockTimeout = lockTimeout
  }

  /**
   * Safe to opt in: `withStepLock` below takes a real `GET_LOCK`, so the relay's
   * redundant dispatches lose the claim instead of executing twice.
   */
  protected override async findUndispatchedSteps(
    before: Date,
    limit: number
  ): Promise<Array<{ runId: string; stepId: string }>> {
    return this.queryUndispatchedSteps(before, limit)
  }

  /**
   * MySQL has `JSON_SET` but no `json()`; a JSON literal is cast instead, so
   * the value lands as a JSON value rather than as a quoted string.
   */
  protected override jsonSetState(path: string, json: string) {
    return sql<string>`JSON_SET(COALESCE(state, '{}'), ${path}, CAST(${json} AS JSON))`
  }

  async withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const lockName = `pikku:run:${id}`
    const timeout = this.lockTimeout
    const acquired = await sql<{
      result: number
    }>`SELECT GET_LOCK(${lockName}, ${timeout}) as result`.execute(this.db)
    if (acquired.rows[0]?.result !== 1) {
      throw new Error(`Failed to acquire lock for run ${id}`)
    }
    try {
      return await fn()
    } finally {
      await sql`SELECT RELEASE_LOCK(${lockName})`.execute(this.db)
    }
  }

  async withStepLock<T>(
    runId: string,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const lockName = `pikku:step:${runId}:${stepName}`
    const timeout = this.lockTimeout
    const acquired = await sql<{
      result: number
    }>`SELECT GET_LOCK(${lockName}, ${timeout}) as result`.execute(this.db)
    if (acquired.rows[0]?.result !== 1) {
      throw new Error(
        `Failed to acquire lock for step ${stepName} in run ${runId}`
      )
    }
    try {
      return await fn()
    } finally {
      await sql`SELECT RELEASE_LOCK(${lockName})`.execute(this.db)
    }
  }
}
