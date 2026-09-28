import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  buildWebhooksMeta,
  serializeWebhooks,
} from './serialize-outgoing-webhooks.js'

const webhooks = [
  {
    file: '/app/src/webhooks/order.ts',
    variable: 'orderPaid',
    event: 'order.paid',
    title: 'Order paid',
    description: 'Sent when a customer pays',
    payload: { orderId: 'z.string()' },
  },
  {
    file: '/app/src/webhooks/booking.ts',
    variable: 'bookingMade',
    event: 'booking.made',
    title: 'Booking made',
  },
]

describe('serializeWebhooks', () => {
  test('maps each declared event to its payload type', () => {
    const content = serializeWebhooks({
      webhooks,
      outgoingWebhooksFile:
        '/app/.pikku/webhooks/pikku-outgoing-webhooks.gen.ts',
      packageMappings: {},
    })

    assert.match(
      content,
      /import type \{ bookingMade as webhook0 \} from '\.\.\/\.\.\/src\/webhooks\/booking\.js'/
    )
    assert.match(
      content,
      /"booking\.made": OutgoingWebhookPayloadOf<typeof webhook0>/
    )
    assert.match(
      content,
      /"order\.paid": OutgoingWebhookPayloadOf<typeof webhook1>/
    )
    assert.match(
      content,
      /export type TypedWebhookService = CoreTypedWebhookService<OutgoingWebhooksMap>/
    )
    assert.match(
      content,
      /import '\.\/pikku-outgoing-webhooks-meta\.gen\.json'/
    )
    assert.match(content, /export const typedWebhookService = /)
  })

  test('emits an empty map when nothing is declared', () => {
    const content = serializeWebhooks({
      webhooks: [],
      outgoingWebhooksFile:
        '/app/.pikku/webhooks/pikku-outgoing-webhooks.gen.ts',
      packageMappings: {},
    })

    assert.match(content, /export interface OutgoingWebhooksMap \{\}/)
  })
})

describe('buildWebhooksMeta', () => {
  test('keys declarations by event with their listing fields', () => {
    assert.deepEqual(buildWebhooksMeta(webhooks), {
      'booking.made': {
        event: 'booking.made',
        title: 'Booking made',
        exportedName: 'bookingMade',
        sourceFile: '/app/src/webhooks/booking.ts',
      },
      'order.paid': {
        event: 'order.paid',
        title: 'Order paid',
        description: 'Sent when a customer pays',
        payload: { orderId: 'z.string()' },
        exportedName: 'orderPaid',
        sourceFile: '/app/src/webhooks/order.ts',
      },
    })
  })
})
