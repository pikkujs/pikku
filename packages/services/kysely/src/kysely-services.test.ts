import { describe, test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import { SerializePlugin } from './serialize-plugin.js'
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
import { KyselyAgentStorageService } from './kysely-agent-storage-service.js'
import { KyselyAgentRunService } from './kysely-agent-run-service.js'
import { KyselySecretService } from './kysely-secret-service.js'
import { KyselyCredentialService } from './kysely-credential-service.js'
import { KyselySessionStore } from './kysely-session-store.js'

function createSqliteDb(): Kysely<KyselyPikkuDB> {
  return new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({
      database: new Database(':memory:'),
    }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
}

function createPostgresDb(): Kysely<KyselyPikkuDB> | null {
  const url = process.env.DATABASE_URL
  if (!url) return null

  return new Kysely<KyselyPikkuDB>({
    dialect: new PostgresJSDialect({ postgres: postgres(url) }),
    plugins: [new CamelCasePlugin()],
  })
}

async function dropAllTables(db: Kysely<KyselyPikkuDB>): Promise<void> {
  const tables = [
    'pikku_deployment_functions',
    'pikku_deployments',
    'agent_tool_call',
    'agent_message',
    'agent_run_score',
    'agent_run',
    'agent_working_memory',
    'agent_threads',
    'channel_subscriptions',
    'channels',
    'workflow_step_history',
    'workflow_step',
    'workflow_runs',
    'workflow_versions',
    'secrets_audit',
    'secret_kek_salts',
    'secrets',
    'credentials_audit',
    'credential_kek_salts',
    'credentials',
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
      agentStorageService: async () => {
        const s = new KyselyAgentStorageService(getDb())
        await s.init()
        return s
      },
      agentRunService: async () => new KyselyAgentRunService(getDb()),
      secretService: async (config) => {
        const s = new KyselySecretService(getDb(), config)
        await s.init()
        return s
      },
      credentialService: async (config) => {
        const s = new KyselyCredentialService(getDb(), config)
        await s.init()
        return s
      },
      sessionStore: async () => {
        const s = new KyselySessionStore(getDb())
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
      await service.setSecret('audit-test', 'value')
      await service.getSecret('audit-test')
      await service.deleteSecret('audit-test')

      const logs = await getDb()
        .selectFrom('secretsAudit')
        .select(['secretKey', 'action'])
        .where('secretKey', '=', 'audit-test')
        .orderBy('performedAt', 'asc')
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
      await service.setSecret('no-read-audit', 'value')
      await service.getSecret('no-read-audit')

      const logs = await getDb()
        .selectFrom('secretsAudit')
        .select(['action'])
        .where('secretKey', '=', 'no-read-audit')
        .execute()

      assert.equal(logs.length, 1)
      assert.equal(logs[0]!.action, 'write')
    })
  })

  describe(`KyselySecretService KEK derivation [${dialectName}]`, () => {
    const kek = 'test-key-encryption-key-32chars!'

    beforeEach(async () => {
      await getDb().deleteFrom('secrets').execute()
      await getDb().deleteFrom('secretKekSalts').execute()
    })

    test('a KEK salt row is created once per key version', async () => {
      const service = new KyselySecretService(getDb(), { key: kek })
      await service.init()
      await service.setSecret('salt-a', 'one')
      await service.setSecret('salt-b', 'two')

      const rows = await getDb()
        .selectFrom('secretKekSalts')
        .select(['keyVersion', 'salt'])
        .execute()

      assert.equal(rows.length, 1)
      assert.equal(rows[0]!.keyVersion, 1)
      assert.ok(rows[0]!.salt.length > 0)
    })

    test('a second instance reuses the stored salt rather than minting one', async () => {
      const first = new KyselySecretService(getDb(), { key: kek })
      await first.init()
      await first.setSecret('shared-salt', 'value')

      const second = new KyselySecretService(getDb(), { key: kek })
      await second.init()
      assert.equal((await second.getSecret('shared-salt')).reveal(), 'value')

      const rows = await getDb()
        .selectFrom('secretKekSalts')
        .selectAll()
        .execute()
      assert.equal(rows.length, 1)
    })

    test('getSecrets over 50 secrets costs one KEK derivation, not 50', async () => {
      const service = new KyselySecretService(getDb(), { key: kek })
      await service.init()

      const keys: string[] = []
      for (let i = 0; i < 50; i++) {
        const key = `bulk-${i}`
        keys.push(key)
        await service.setSecret(key, `value-${i}`)
      }

      const reader = new KyselySecretService(getDb(), { key: kek })
      await reader.init()

      const start = performance.now()
      const out = await reader.getSecrets(keys)
      const elapsed = performance.now() - start

      assert.equal(Object.keys(out).length, 50)
      assert.equal(out['bulk-7']!.reveal(), 'value-7')
      assert.ok(
        elapsed < 400,
        `getSecrets over 50 secrets took ${elapsed.toFixed(0)}ms; one derivation per secret would cost seconds`
      )
    })

    test('rotateKEK over 50 secrets derives two KEKs, not 100', async () => {
      const previousKey = 'previous-key-encryption-key-32c!'
      const writer = new KyselySecretService(getDb(), {
        key: previousKey,
        keyVersion: 1,
      })
      await writer.init()

      for (let i = 0; i < 50; i++) {
        await writer.setSecret(`rotate-${i}`, `value-${i}`)
      }

      const rotator = new KyselySecretService(getDb(), {
        key: kek,
        keyVersion: 2,
        previousKey,
      })
      await rotator.init()

      const start = performance.now()
      const rotated = await rotator.rotateKEK()
      const elapsed = performance.now() - start

      assert.equal(rotated, 50)
      assert.equal((await rotator.getSecret('rotate-7')).reveal(), 'value-7')
      assert.ok(
        elapsed < 700,
        `rotating 50 secrets took ${elapsed.toFixed(0)}ms; two derivations per secret would cost seconds`
      )

      const salts = await getDb()
        .selectFrom('secretKekSalts')
        .select('keyVersion')
        .orderBy('keyVersion', 'asc')
        .execute()
      assert.deepEqual(
        salts.map((r) => r.keyVersion),
        [1, 2]
      )
    })

    test('a wrong KEK passphrase fails loudly rather than returning garbage', async () => {
      const writer = new KyselySecretService(getDb(), { key: kek })
      await writer.init()
      await writer.setSecret('wrong-kek', 'value')

      const reader = new KyselySecretService(getDb(), {
        key: 'a-completely-different-kek-32ch!',
      })
      await reader.init()
      await assert.rejects(() => reader.getSecret('wrong-kek'))
    })
  })

  describe(`KyselyCredentialService audit [${dialectName}]`, () => {
    const kek = 'test-key-encryption-key-32chars!'

    test('audit logs writes, reads, and deletes', async () => {
      const service = new KyselyCredentialService(getDb(), {
        key: kek,
        audit: true,
        auditReads: true,
      })
      await service.init()
      await service.set('audit-cred', { token: 'abc' }, 'user-1')
      await service.get('audit-cred', 'user-1')
      await service.delete('audit-cred', 'user-1')

      const logs = await getDb()
        .selectFrom('credentialsAudit')
        .select(['credentialName', 'userId', 'action'])
        .where('credentialName', '=', 'audit-cred')
        .orderBy('performedAt', 'asc')
        .execute()

      assert.equal(logs.length, 3)
      assert.equal(logs[0]!.action, 'write')
      assert.equal(logs[0]!.userId, 'user-1')
      assert.equal(logs[1]!.action, 'read')
      assert.equal(logs[2]!.action, 'delete')
    })

    test('audit logs global credential with null user_id', async () => {
      const service = new KyselyCredentialService(getDb(), {
        key: kek,
        audit: true,
        auditReads: true,
      })
      await service.init()
      await service.set('global-cred', { key: 'val' })
      await service.get('global-cred')

      const logs = await getDb()
        .selectFrom('credentialsAudit')
        .select(['credentialName', 'userId', 'action'])
        .where('credentialName', '=', 'global-cred')
        .execute()

      assert.equal(logs.length, 2)
      assert.equal(logs[0]!.userId, null)
      assert.equal(logs[1]!.userId, null)
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
