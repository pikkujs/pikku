import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { MongoClient, type Db } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { defineServiceTests } from '@pikku/core/testing'

import { MongoDBChannelStore } from './mongodb-channel-store.js'
import { MongoDBEventHubStore } from './mongodb-eventhub-store.js'
import { MongoDBWorkflowService } from './mongodb-workflow-service.js'
import { MongoDBWorkflowRunService } from './mongodb-workflow-run-service.js'
import { MongoDBDeploymentService } from './mongodb-deployment-service.js'
import { MongoDBAgentStorageService } from './mongodb-agent-storage-service.js'
import { MongoDBAgentRunService } from './mongodb-agent-run-service.js'
import { MongoDBSecretService } from './mongodb-secret-service.js'
import { MongoDBSessionStore } from './mongodb-session-store.js'

function registerTests(name: string, getDb: () => Db) {
  defineServiceTests({
    name,
    services: {
      channelStore: async () => {
        const s = new MongoDBChannelStore(getDb())
        await s.init()
        return s
      },
      eventHubStore: async () => {
        const s = new MongoDBEventHubStore(getDb())
        await s.init()
        return s
      },
      workflowService: async () => {
        const s = new MongoDBWorkflowService(getDb())
        await s.init()
        return s
      },
      workflowRunService: async () => new MongoDBWorkflowRunService(getDb()),
      deploymentService: async () => {
        const s = new MongoDBDeploymentService(
          { heartbeatInterval: 60000, heartbeatTtl: 120000 },
          getDb()
        )
        await s.init()
        return s
      },
      agentStorageService: async () => {
        const s = new MongoDBAgentStorageService(getDb())
        await s.init()
        return s
      },
      agentRunService: async () => new MongoDBAgentRunService(getDb()),
      secretService: async (config) => {
        const s = new MongoDBSecretService(getDb(), config)
        await s.init()
        return s
      },
      sessionStore: async () => {
        const s = new MongoDBSessionStore(getDb())
        await s.init()
        return s
      },
    },
  })

  describe(`MongoDBSecretService audit [${name}]`, () => {
    const kek = 'test-key-encryption-key-32chars!'

    test('audit logs writes, reads, and deletes', async () => {
      const service = new MongoDBSecretService(getDb(), {
        key: kek,
        audit: true,
        auditReads: true,
      })
      await service.init()
      await service.setSecret('audit-test', 'value')
      await service.getSecret('audit-test')
      await service.deleteSecret('audit-test')

      const logs = await getDb()
        .collection('secrets_audit')
        .find({ secretKey: 'audit-test' })
        .sort({ performedAt: 1 })
        .toArray()

      assert.equal(logs.length, 3)
      assert.equal(logs[0]!.action, 'write')
      assert.equal(logs[1]!.action, 'read')
      assert.equal(logs[2]!.action, 'delete')
    })

    test('audit skips reads when auditReads is false', async () => {
      const service = new MongoDBSecretService(getDb(), {
        key: kek,
        audit: true,
        auditReads: false,
      })
      await service.init()
      await service.setSecret('no-read-audit', 'value')
      await service.getSecret('no-read-audit')

      const logs = await getDb()
        .collection('secrets_audit')
        .find({ secretKey: 'no-read-audit' })
        .toArray()

      assert.equal(logs.length, 1)
      assert.equal(logs[0]!.action, 'write')
    })
  })

  describe(`MongoDBSecretService decryption failures [${name}]`, () => {
    const kek = 'test-key-encryption-key-32chars!'
    const otherKek = 'a-totally-different-kek-32chars!'

    test('getSecrets throws naming a secret it cannot decrypt', async () => {
      const writer = new MongoDBSecretService(getDb(), { key: kek })
      await writer.init()
      await writer.setSecret('undecryptable', { token: 'abc' })

      const reader = new MongoDBSecretService(getDb(), { key: otherKek })
      await reader.init()

      await assert.rejects(
        () => reader.getSecrets(['undecryptable']),
        (error: Error) => {
          assert.equal(
            error.message,
            'Failed to decrypt secret "undecryptable" (key_version 1): ' +
              'the configured KEK does not match the key it was wrapped under'
          )
          assert.ok(error.cause, 'the underlying crypto failure is preserved')
          return true
        }
      )
    })

    test('getSecrets throws when no KEK is available for a stored key_version', async () => {
      const writer = new MongoDBSecretService(getDb(), {
        key: kek,
        keyVersion: 7,
      })
      await writer.init()
      await writer.setSecret('old-version', 'value')

      const reader = new MongoDBSecretService(getDb(), {
        key: kek,
        keyVersion: 8,
      })
      await reader.init()

      await assert.rejects(
        () => reader.getSecrets(['old-version']),
        (error: Error) => {
          assert.equal(
            error.message,
            'Failed to decrypt secret "old-version" (key_version 7): ' +
              'the configured KEK does not match the key it was wrapped under'
          )
          return true
        }
      )
    })

    test('getSecrets returns every secret when they all decrypt', async () => {
      const service = new MongoDBSecretService(getDb(), { key: kek })
      await service.init()
      await service.setSecret('batch-a', { v: 1 })
      await service.setSecret('batch-b', 'two')

      const out = await service.getSecrets<{
        'batch-a': { v: number }
        'batch-b': string
      }>(['batch-a', 'batch-b'])

      assert.deepEqual(out['batch-a']!.reveal(), { v: 1 })
      assert.equal(out['batch-b']!.reveal(), 'two')
    })

    test('getSecrets omits keys that were never stored', async () => {
      const service = new MongoDBSecretService(getDb(), { key: kek })
      await service.init()
      await service.setSecret('present', 'here')

      const out = await service.getSecrets(['present', 'never-stored'])

      assert.deepEqual(Object.keys(out), ['present'])
      assert.equal(out.present!.reveal(), 'here')
    })
  })
}

describe('MongoDB Services - In-Memory', () => {
  let mongod: MongoMemoryServer
  let client: MongoClient
  let db: Db

  before(async () => {
    mongod = await MongoMemoryServer.create()
    const uri = mongod.getUri()
    client = new MongoClient(uri)
    await client.connect()
    db = client.db('pikku_test')
  })

  after(async () => {
    await client.close()
    await mongod.stop()
  })

  registerTests('MongoMemory', () => db)
})

describe(
  'MongoDB Services - Real',
  {
    skip: !process.env.MONGODB_URL ? 'MONGODB_URL not set' : undefined,
  },
  () => {
    let client: MongoClient
    let db: Db

    before(async () => {
      client = new MongoClient(process.env.MONGODB_URL!)
      await client.connect()
      db = client.db('pikku_test')
      await db.dropDatabase()
    })

    after(async () => {
      if (db) await db.dropDatabase()
      if (client) await client.close()
    })

    registerTests('Real MongoDB', () => db)
  }
)
