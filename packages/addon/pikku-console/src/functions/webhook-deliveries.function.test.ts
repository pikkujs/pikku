import assert from 'node:assert/strict'
import { test } from 'node:test'

import { listWebhookDeliveries } from './list-webhook-deliveries.function.js'
import { getWebhookDelivery } from './get-webhook-delivery.function.js'

test('an app that wires no webhook service lists nothing rather than throwing', async () => {
  const deliveries = await listWebhookDeliveries.func(
    { webhookService: undefined } as never,
    {} as never,
    {} as never
  )
  assert.deepEqual(deliveries, [])
})

test('a delivery read against no webhook service is a miss, not a crash', async () => {
  const delivery = await getWebhookDelivery.func(
    { webhookService: undefined } as never,
    { deliveryId: 'whatever' } as never,
    {} as never
  )
  assert.equal(delivery, null)
})

test('a wired webhook service is still read through', async () => {
  const record = { deliveryId: 'd1' }
  const services = {
    webhookService: {
      listDeliveries: async () => [record],
      getDelivery: async (deliveryId: string) =>
        deliveryId === 'd1' ? { delivery: record, attempts: [] } : null,
    },
  } as never

  assert.deepEqual(
    await listWebhookDeliveries.func(services, {} as never, {} as never),
    [record]
  )
  assert.deepEqual(
    await getWebhookDelivery.func(
      services,
      { deliveryId: 'd1' } as never,
      {} as never
    ),
    { delivery: record, attempts: [] }
  )
})
