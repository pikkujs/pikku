import { KyselyWorkflowService } from '@pikku/kysely'
import { sql } from 'kysely'
import { jsonbText } from './jsonb.js'
import { pgNowMs } from './pg-now-ms.js'

export class PgKyselyWorkflowService extends KyselyWorkflowService {
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

  /** Step leases are judged on the database's clock, which every worker shares. */
  protected override nowMs() {
    return pgNowMs()
  }
}
