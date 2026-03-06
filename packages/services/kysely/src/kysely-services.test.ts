import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Kysely, SqliteDialect } from 'kysely'
import { SerializePlugin } from 'kysely-plugin-serialize'
import Database from 'better-sqlite3'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import { defineServiceTests } from '@pikku/core/testing'

import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyChannelStore } from './kysely-channel-store.js'
import { KyselyEventHubStore } from './kysely-eventhub-store.js'
import { KyselyWorkflowService } from './kysely-workflow-service.js'
import { KyselyWorkflowRunService } from './kysely-workflow-run-service.js'
import { KyselyDeploymentService } from './kysely-deployment-service.js'
import { KyselyAIStorageService } from './kysely-ai-storage-service.js'
import { KyselyAgentRunService } from './kysely-agent-run-service.js'
import { KyselySecretService } from './kysely-secret-service.js'

function createSqliteDb(): Kysely<KyselyPikkuDB> {
  return new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({
      database: new Database(':memory:'),
    }),
    plugins: [new SerializePlugin()],
  })
}

function createPostgresDb(): Kysely<KyselyPikkuDB> | null {
  const url = process.env.DATABASE_URL
  if (!url) return null

  return new Kysely<KyselyPikkuDB>({
    dialect: new PostgresJSDialect({ postgres: postgres(url) }),
  })
}

async function dropAllTables(db: Kysely<KyselyPikkuDB>): Promise<void> {
  const tables = [
    'pikku_deployment_functions',
    'pikku_deployments',
    'ai_tool_call',
    'ai_message',
    'ai_run',
    'ai_working_memory',
    'ai_threads',
    'channel_subscriptions',
    'channels',
    'workflow_step_history',
    'workflow_step',
    'workflow_runs',
    'workflow_versions',
    'secrets_audit',
    'secrets',
  ]
  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute()
  }
}

function registerTests(
  dialectName: string,
  getDb: () => Kysely<KyselyPikkuDB>
) {
  defineServiceTests({
    name: dialectName,
    services: {
      channelStore: async () => {
        const s = new KyselyChannelStore(getDb())
        await s.init()
        return s
      },
      eventHubStore: async () => {
        const s = new KyselyEventHubStore(getDb())
        await s.init()
        return s
      },
      workflowService: async () => {
        const s = new KyselyWorkflowService(getDb())
        await s.init()
        return s
      },
      workflowRunService: async () => new KyselyWorkflowRunService(getDb()),
      deploymentService: async () => {
        const s = new KyselyDeploymentService(
          { heartbeatInterval: 60000, heartbeatTtl: 120000 },
          getDb()
        )
        await s.init()
        return s
      },
      aiStorageService: async () => {
        const s = new KyselyAIStorageService(getDb())
        await s.init()
        return s
      },
      agentRunService: async () => new KyselyAgentRunService(getDb()),
      secretService: async (config) => {
        const s = new KyselySecretService(getDb(), config)
        await s.init()
        return s
      },
    },
  })

  describe(`KyselySecretService audit [${dialectName}]`, () => {
    const kek = 'test-key-encryption-key-32chars!'

    test('audit logs writes, reads, and deletes', async () => {
      const service = new KyselySecretService(getDb(), {
        key: kek,
        audit: true,
        auditReads: true,
      })
      await service.init()
      await service.setSecretJSON('audit-test', 'value')
      await service.getSecret('audit-test')
      await service.deleteSecret('audit-test')

      const logs = await getDb()
        .selectFrom('secrets_audit')
        .select(['secret_key', 'action'])
        .where('secret_key', '=', 'audit-test')
        .orderBy('performed_at', 'asc')
        .execute()

      assert.equal(logs.length, 3)
      assert.equal(logs[0]!.action, 'write')
      assert.equal(logs[1]!.action, 'read')
      assert.equal(logs[2]!.action, 'delete')
    })

    test('audit skips reads when auditReads is false', async () => {
      const service = new KyselySecretService(getDb(), {
        key: kek,
        audit: true,
        auditReads: false,
      })
      await service.init()
      await service.setSecretJSON('no-read-audit', 'value')
      await service.getSecret('no-read-audit')

      const logs = await getDb()
        .selectFrom('secrets_audit')
        .select(['action'])
        .where('secret_key', '=', 'no-read-audit')
        .execute()

      assert.equal(logs.length, 1)
      assert.equal(logs[0]!.action, 'write')
    })
  })
}

describe('Kysely Services - SQLite', () => {
  let db: Kysely<KyselyPikkuDB>

  before(async () => {
    db = createSqliteDb()
  })

  after(async () => {
    await db.destroy()
  })

  registerTests('SQLite', () => db)
})

describe(
  'Kysely Services - PostgreSQL',
  {
    skip: !process.env.DATABASE_URL ? 'DATABASE_URL not set' : undefined,
  },
  () => {
    let db: Kysely<KyselyPikkuDB>

    before(async () => {
      db = createPostgresDb()!
      await dropAllTables(db)
    })

    after(async () => {
      if (db) {
        await dropAllTables(db)
        await db.destroy()
      }
    })

    registerTests('PostgreSQL', () => db)
  }
)
