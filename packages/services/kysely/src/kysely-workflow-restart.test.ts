import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'
import { InMemoryLeaseService } from '@pikku/core/services'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { SerializePlugin } from './serialize-plugin.js'
import { KyselyWorkflowService } from './kysely-workflow-service.js'
import { applyPikkuSchemas, workflowSchema } from './schema/index.js'
import { KyselyWorkflowRunService } from './kysely-workflow-run-service.js'

const open = (file: string) =>
  new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(file) }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })

const service = (db: Kysely<KyselyPikkuDB>) =>
  new KyselyWorkflowService(db, {
    wireQueues: false,
    leaseService: new InMemoryLeaseService(),
  })

describe('workflow runs across a restart', () => {
  test('a suspended run is still there for a new service on the same SQLite file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-workflow-restart-'))
    const file = join(dir, 'app.db')
    try {
      const first = open(file)
      await applyPikkuSchemas(first, [workflowSchema])
      const before = service(first)
      await before.init()
      const runId = await before.createRun('wf', { n: 1 }, false, 'hash', {
        type: 'internal',
      } as any)
      await before.updateRunStatus(runId, 'suspended')
      await first.destroy()

      const second = open(file)
      try {
        const after = service(second)
        await after.init()
        const run = await after.getRun(runId)
        assert.equal(run?.status, 'suspended')
        assert.deepEqual(run?.input, { n: 1 })

        const listed = await new KyselyWorkflowRunService(second).listRuns()
        assert.deepEqual(
          listed.map((r) => r.id),
          [runId]
        )
      } finally {
        await second.destroy()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
