import { KyselyWorkflowService } from '@pikku/kysely'
import type { WorkflowVersionStatus } from '@pikku/core/workflow'
import { sql } from 'kysely'
import { mysqlNowMs } from './mysql-now-ms.js'

export class MySQLKyselyWorkflowService extends KyselyWorkflowService {
  /**
   * MySQL has `JSON_SET` but no `json()`; a JSON literal is cast instead, so
   * the value lands as a JSON value rather than as a quoted string.
   */
  protected override jsonSetState(path: string, json: string) {
    return sql<string>`JSON_SET(COALESCE(state, '{}'), ${path}, CAST(${json} AS JSON))`
  }

  /** Step leases are judged on the database's clock, which every worker shares. */
  protected override nowMs() {
    return mysqlNowMs()
  }

  /**
   * MySQL has no `ON CONFLICT`; re-assigning the key to itself on a duplicate
   * leaves the recorded version untouched, as `DO NOTHING` does elsewhere.
   */
  protected override async upsertWorkflowVersionImpl(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status?: WorkflowVersionStatus
  ): Promise<void> {
    await this.db
      .insertInto('workflowVersions')
      .values({
        workflowName: name,
        graphHash,
        graph: JSON.stringify(graph),
        source,
        status: status ?? 'active',
      })
      .onDuplicateKeyUpdate({ graphHash })
      .execute()
  }
}
