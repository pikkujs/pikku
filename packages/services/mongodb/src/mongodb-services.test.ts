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
import { MongoDBAIStorageService } from './mongodb-ai-storage-service.js'
import { MongoDBAgentRunService } from './mongodb-agent-run-service.js'
import { MongoDBSecretService } from './mongodb-secret-service.js'

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
      aiStorageService: async () => {
        const s = new MongoDBAIStorageService(getDb())
        await s.init()
        return s
      },
      agentRunService: async () => new MongoDBAgentRunService(getDb()),
      secretService: async (config) => {
        const s = new MongoDBSecretService(getDb(), config)
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
      await service.setSecretJSON('audit-test', 'value')
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
      await service.setSecretJSON('no-read-audit', 'value')
      await service.getSecret('no-read-audit')

      const logs = await getDb()
        .collection('secrets_audit')
        .find({ secretKey: 'no-read-audit' })
        .toArray()

      assert.equal(logs.length, 1)
      assert.equal(logs[0]!.action, 'write')
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
