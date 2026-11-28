/**
 * A database built from a template's own SQLite migrations has every column the
 * workflow service writes when it records a step.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'

import type { KyselyPikkuDB } from './kysely-tables.js'
import { SerializePlugin } from './serialize-plugin.js'
import { KyselyWorkflowService } from './kysely-workflow-service.js'

const templatesDir = fileURLToPath(
  new URL('../../../../templates', import.meta.url)
)

describe('template SQLite migrations', () => {
  for (const template of ['online-shop', 'field-service']) {
    test(`${template}: a workflow step can be inserted`, async () => {
      const migrationsDir = join(templatesDir, template, 'db/sqlite')
      const database = new Database(':memory:')
      for (const file of readdirSync(migrationsDir)
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        database.exec(readFileSync(join(migrationsDir, file), 'utf8'))
      }
      const db = new Kysely<KyselyPikkuDB>({
        dialect: new SqliteDialect({ database }),
        plugins: [new CamelCasePlugin(), new SerializePlugin()],
      })

      try {
        const service = new KyselyWorkflowService(db, { wireQueues: false })
        await service.init()
        const runId = await service.createRun(
          'templateWorkflow',
          {},
          false,
          'hash',
          { type: 'test' }
        )
        const step = await service.insertStepState(
          runId,
          'first step',
          'firstStepRpc',
          {}
        )

        assert.equal(step.status, 'pending')
      } finally {
        await db.destroy()
      }
    })
  }
})
