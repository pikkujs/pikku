import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { WebhookService } from '../../services/webhook-service.js'
import {
  defineOutgoingWebhook,
  type TypedWebhookService,
  type OutgoingWebhookPayloadOf,
} from './define-outgoing-webhook.js'

const schema = <T>(): StandardSchemaV1<T> => ({
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => ({ value: value as T }),
  },
})

const orderPaid = defineOutgoingWebhook({
  event: 'order.paid',
  title: 'Order paid',
  payload: schema<{ orderId: string; total: number }>(),
})

interface OutgoingWebhooksMap {
  'order.paid': OutgoingWebhookPayloadOf<typeof orderPaid>
}

const sent: unknown[] = []
const service = {
  send: async (input: unknown) => {
    sent.push(input)
    return { deliveryId: 'd1', delivered: true, attempts: 1 }
  },
} as unknown as WebhookService

const typed = service as unknown as TypedWebhookService<OutgoingWebhooksMap>

describe('defineOutgoingWebhook', () => {
  test('returns the declaration as given', () => {
    assert.equal(orderPaid.event, 'order.paid')
    assert.equal(orderPaid.title, 'Order paid')
  })

  test('narrows data by a declared event and accepts undeclared ones', async () => {
    await typed.send({
      url: 'https://example.com/hook',
      event: 'order.paid',
      data: { orderId: 'o1', total: 5 },
    })
    await typed.send({
      url: 'https://example.com/hook',
      event: 'order.paid',
      // @ts-expect-error total must be a number for a declared event
      data: { orderId: 'o1', total: '5' },
    })
    await typed.send({
      url: 'https://example.com/hook',
      event: 'order.paid',
      // @ts-expect-error a declared event needs its whole payload
      data: { orderId: 'o1' },
    })
    await typed.send({
      url: 'https://example.com/hook',
      event: 'something.else',
      data: { anything: true },
    })
    await typed.send({ url: 'https://example.com/hook', data: 'raw' })
    assert.equal(sent.length, 5)
  })
})
