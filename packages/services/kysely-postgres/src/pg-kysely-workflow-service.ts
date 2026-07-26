import { KyselyWorkflowService } from '@pikku/kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import type { WorkflowQueueOptions } from '@pikku/core/workflow'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export class PgKyselyWorkflowService extends KyselyWorkflowService {
  constructor(db: Kysely<KyselyPikkuDB>, options: WorkflowQueueOptions = {}) {
    super(db, options)
  }

  /**
   * Postgres has no `json_set`. The column is text, so it is cast to jsonb for
   * the merge and back afterwards; `||` is used rather than `jsonb_set` because
   * `jsonb_set` will not create a key that is not already present.
   *
   * The value is cast explicitly to jsonb rather than passed as a bare
   * parameter, so it lands as a JSON value and not as a JSON string that
   * happens to contain JSON.
   */
  protected override jsonSetState(path: string, json: string) {
    // The base builds `$."key"`; Postgres addresses jsonb keys by bare name.
    const key = JSON.parse(path.slice(2))
    return sql<string>`(coalesce(state, '{}')::jsonb || jsonb_build_object(${key}::text, ${json}::jsonb))::text`
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
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(${lockId})`.execute(trx)
      return fn()
    })
  }

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
