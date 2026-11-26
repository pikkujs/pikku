/**
 * The workflow store conformance on a real Postgres server, where the suite in
 * `pg-kysely-workflow-service.test.ts` uses PGlite. Skipped unless
 * `DATABASE_URL` is set; `scripts/test-trace-adapters.sh` starts one.
 */
import test, { after } from 'node:test'
import { CamelCasePlugin, Kysely, sql } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import type { KyselyPikkuDB } from '@pikku/kysely'
import { applyPikkuSchemas, workflowSchema } from '@pikku/kysely'
import { defineServiceTests } from '@pikku/core/testing'
import { InMemoryLeaseService } from '@pikku/core/services'
import type { WorkflowServiceOptions } from '@pikku/core/workflow'
import { PgKyselyWorkflowRunService } from './pg-kysely-workflow-run-service.js'
import { PgKyselyWorkflowService } from './pg-kysely-workflow-service.js'
import { pgNowMs } from './pg-now-ms.js'

const url = process.env.DATABASE_URL

if (!url) {
  test.skip('the Postgres server conformance needs DATABASE_URL', () => {})
} else {
  const db = new Kysely<KyselyPikkuDB>({
    dialect: new PostgresJSDialect({
      postgres: postgres(url, { max: 5, onnotice: () => {} }),
    }),
    plugins: [new CamelCasePlugin()],
  })
  after(() => db.destroy())

  const fresh = async () => {
    await sql`DROP SCHEMA public CASCADE`.execute(db)
    await sql`CREATE SCHEMA public`.execute(db)
    await applyPikkuSchemas(db, [workflowSchema])
    const service = new PgKyselyWorkflowService(db, {
      wireQueues: false,
      leaseService: new InMemoryLeaseService(),
    } as WorkflowServiceOptions)
    await service.init()
    return service
  }

  // On their own: the run service suite reads the runs the one before it left.
  defineServiceTests({
    name: 'Postgres server',
    services: {
      workflowService: fresh,
      workflowRunService: async () => new PgKyselyWorkflowRunService(db),
    },
  })

  defineServiceTests({
    name: 'Postgres server',
    services: {
      workflowCompensationQueued: fresh,
      workflowFencing: async () => {
        return {
          service: await fresh(),
          lapseLease: async (runId, stepName) => {
            await db
              .updateTable('workflowStep')
              .set({ leaseExpiresAt: sql<number>`${pgNowMs()} - 60000` })
              .where('workflowRunId', '=', runId)
              .where('stepName', '=', stepName)
              .execute()
          },
        }
      },
    },
  })
}
