import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'
import { setSingletonServices } from '@pikku/core'

import type { KyselyPikkuDB } from './kysely-tables.js'
import { SerializePlugin } from './serialize-plugin.js'
import { KyselyWebhookService } from './kysely-webhook-service.js'

const noopLogger = { error() {}, info() {}, warn() {}, debug() {} }

function createDb(): Kysely<KyselyPikkuDB> {
  return new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
}

const createQueue = () => {
  const added: { data: any; options: any }[] = []
  return {
    added,
    queue: {
      supportsResults: false,
      add: async (_name: string, data: any, options: any) => {
        added.push({ data, options })
        return options?.jobId ?? 'job-1'
      },
      getJob: async () => null,
    },
  }
}

// send() resolves config/secrets through the singleton services.
const setServices = () =>
  setSingletonServices({
    logger: noopLogger,
    config: {},
    secrets: {
      getSecret: async (key: string) => {
        throw new Error(`Secret not found: ${key}`)
      },
    },
  } as any)

describe('KyselyWebhookService', () => {
  beforeEach(setServices)

  test('send() inserts a pending delivery and enqueues with deliveryId === jobId', async () => {
    const db = createDb()
    const { added, queue } = createQueue()
    const service = new KyselyWebhookService(queue as any, db)
    await service.init()

    const { jobId } = await service.send({
      url: 'https://example.com/hook',
      event: 'user.created',
      data: { id: 'u1' },
      organizationId: 'org-1',
    })

    // jobId is the delivery id and rides in the payload.
    assert.equal(added.length, 1)
    assert.equal(added[0]!.options.jobId, jobId)
    assert.equal(added[0]!.data.deliveryId, jobId)

    const delivery = await service.getDelivery(jobId)
    assert.ok(delivery)
    assert.equal(delivery!.delivery.status, 'pending')
    assert.equal(delivery!.delivery.organizationId, 'org-1')
    assert.equal(delivery!.delivery.url, 'https://example.com/hook')
    assert.equal(delivery!.attempts.length, 0)
  })

  test('recordAttempt() appends attempts and rolls status forward', async () => {
    const db = createDb()
    const { queue } = createQueue()
    const service = new KyselyWebhookService(queue as any, db)
    await service.init()

    const { jobId } = await service.send({
      url: 'https://example.com/hook',
      data: {},
    })

    await service.recordAttempt(jobId, {
      statusCode: 500,
      error: 'boom',
      delivered: false,
    })
    await service.recordAttempt(jobId, { statusCode: 200, delivered: true })

    const result = await service.getDelivery(jobId)
    assert.equal(result!.attempts.length, 2)
    assert.equal(result!.attempts[0]!.attemptNumber, 1)
    assert.equal(result!.attempts[0]!.statusCode, 500)
    assert.equal(result!.attempts[1]!.attemptNumber, 2)
    assert.equal(result!.delivery.status, 'delivered')
    assert.equal(result!.delivery.attempts, 2)
    assert.ok(result!.delivery.deliveredAt)
  })

  test('listDeliveries() filters by organization', async () => {
    const db = createDb()
    const { queue } = createQueue()
    const service = new KyselyWebhookService(queue as any, db)
    await service.init()

    await service.send({ url: 'https://a.com', data: {}, organizationId: 'o1' })
    await service.send({ url: 'https://b.com', data: {}, organizationId: 'o2' })

    const o1 = await service.listDeliveries({ organizationId: 'o1' })
    assert.equal(o1.length, 1)
    assert.equal(o1[0]!.url, 'https://a.com')

    const all = await service.listDeliveries()
    assert.equal(all.length, 2)
  })
})
