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
