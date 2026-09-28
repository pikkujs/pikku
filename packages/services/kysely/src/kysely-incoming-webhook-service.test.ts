import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'

import type { KyselyPikkuDB } from './kysely-tables.js'
import { SerializePlugin } from './serialize-plugin.js'
import { KyselyIncomingWebhookService } from './kysely-incoming-webhook-service.js'
import { applyPikkuSchemas, incomingWebhookSchema } from './schema/index.js'

const request = {
  body: new Uint8Array(),
  headers: {},
  method: 'post',
  url: '/webhooks/shop',
  query: {},
}

const setup = async () => {
  const db = new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
  await applyPikkuSchemas(db, [incomingWebhookSchema])
  const added: { name: string; data: any; options: any }[] = []
  const queue = {
    supportsResults: false,
    add: async (name: string, data: any, options: any) => {
      added.push({ name, data, options })
      return options?.jobId
    },
    getJob: async () => null,
  }
  const service = new KyselyIncomingWebhookService(queue as any, db, 2)
  await service.init()
  return { service, added }
}

describe('KyselyIncomingWebhookService', () => {
  test('init() refuses a database without the receipt table', async () => {
    const db = new Kysely<KyselyPikkuDB>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
      plugins: [new CamelCasePlugin()],
    })
    const service = new KyselyIncomingWebhookService({} as any, db)
    await assert.rejects(service.init(), /incoming-webhook/)
  })

  test('accept() records a receipt and queues it under the receipt id', async () => {
    const { service, added } = await setup()

    const accepted = await service.accept({
      source: 'shop',
      request,
      events: [{ name: 'paid', id: 'evt_1', data: { amount: 5 } }],
    })

    assert.equal(accepted, 1)
    const [receipt] = await service.listReceipts()
    assert.equal(receipt!.source, 'shop')
    assert.equal(receipt!.event, 'paid')
    assert.equal(receipt!.providerEventId, 'evt_1')
    assert.equal(receipt!.status, 'pending')
    assert.equal(added[0]!.name, 'pikku-incoming-webhooks')
    assert.equal(added[0]!.options.jobId, receipt!.receiptId)
    assert.equal(added[0]!.options.attempts, 3)
    assert.deepEqual(added[0]!.data, {
      source: 'shop',
      event: { name: 'paid', id: 'evt_1', data: { amount: 5 } },
      receiptId: receipt!.receiptId,
    })
  })

  test('a redelivered provider event id is dropped', async () => {
    const { service, added } = await setup()
    const event = { name: 'paid', id: 'evt_1', data: {} }

    assert.equal(
      await service.accept({ source: 'shop', request, events: [event] }),
      1
    )
    assert.equal(
      await service.accept({ source: 'shop', request, events: [event] }),
      0
    )
    assert.equal(
      await service.accept({ source: 'other', request, events: [event] }),
      1
    )
    assert.equal(added.length, 2)
  })

  test('events without an id are never de-duplicated', async () => {
    const { service } = await setup()
    const events = [
      { name: 'paid', data: {} },
      { name: 'paid', data: {} },
    ]

    assert.equal(await service.accept({ source: 'shop', request, events }), 2)
    assert.equal((await service.listReceipts()).length, 2)
  })

  test('recordAttempt() rolls the receipt forward through a retry', async () => {
    const { service } = await setup()
    await service.accept({
      source: 'shop',
      request,
      events: [{ name: 'paid', id: 'evt_1', data: {} }],
    })
    const [{ receiptId }] = (await service.listReceipts()) as [any]

    await service.recordAttempt(receiptId, {
      trigger: 'shop:paid',
      error: 'boom',
    })
    let [receipt] = await service.listReceipts()
    assert.equal(receipt!.status, 'failed')
    assert.equal(receipt!.lastError, 'boom')
    assert.equal(receipt!.attempts, 1)

    await service.recordAttempt(receiptId, { trigger: 'shop:paid' })
    ;[receipt] = await service.listReceipts()
    assert.equal(receipt!.status, 'delivered')
    assert.equal(receipt!.lastError, null)
    assert.equal(receipt!.attempts, 2)
    assert.ok(receipt!.deliveredAt)
  })

  test('listReceipts() filters by source', async () => {
    const { service } = await setup()
    await service.accept({
      source: 'a',
      request,
      events: [{ name: 'x', data: {} }],
    })
    await service.accept({
      source: 'b',
      request,
      events: [{ name: 'x', data: {} }],
    })

    const a = await service.listReceipts({ source: 'a' })
    assert.equal(a.length, 1)
    assert.equal(a[0]!.source, 'a')
  })
})
