import { KyselyLockService, KyselyWorkflowService } from '@pikku/kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import type { WorkflowQueueOptions } from '@pikku/core/workflow'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import { jsonbText } from './jsonb.js'

export class PgKyselyWorkflowService extends KyselyWorkflowService {
  constructor(db: Kysely<KyselyPikkuDB>, options: WorkflowQueueOptions = {}) {
    super(db, { lockService: new KyselyLockService(db), ...options })
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
