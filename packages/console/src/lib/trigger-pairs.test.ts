import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  matchesTriggerQuery,
  pairTriggers,
  sourcePanelMetadata,
  triggerCounts,
} from './trigger-pairs.js'

const stripe = {
  name: 'stripe',
  method: 'post' as const,
  route: '/webhooks/stripe',
  events: ['invoice.paid', 'invoice.failed'],
}

const meta = {
  triggerMeta: {
    'stripe:invoice.paid': { pikkuFuncId: 'onInvoicePaid' },
    stripe: { pikkuFuncId: 'onAnyStripe' },
    orderPlaced: { pikkuFuncId: 'onOrder' },
    'github:push': { pikkuFuncId: 'onPush' },
  },
  triggerSourceMeta: { orderPlaced: { pikkuFuncId: 'orderSource' } },
  webhookSourceMeta: { stripe },
}

const byName = (name: string) =>
  pairTriggers(meta).find((p) => p.name === name)!

describe('trigger pairing', () => {
  test('`<source>:<event>` pairs with its webhook source', () => {
    const pair = byName('stripe:invoice.paid')
    assert.equal(pair.source, null)
    assert.deepEqual(pair.webhook, {
      source: 'stripe',
      event: 'invoice.paid',
      meta: stripe,
    })
  })

  test('a bare `<source>` pairs with its webhook source and no event', () => {
    assert.equal(byName('stripe').webhook?.event, '')
    assert.equal(byName('stripe').webhook?.source, 'stripe')
  })

  test('a plain trigger source still wins and has no webhook', () => {
    const pair = byName('orderPlaced')
    assert.equal(pair.source.pikkuFuncId, 'orderSource')
    assert.equal(pair.webhook, null)
  })

  test('a trigger with no known source has neither', () => {
    const pair = byName('github:push')
    assert.equal(pair.source, null)
    assert.equal(pair.webhook, null)
  })

  test('webhook-fed triggers count as listening, not incomplete', () => {
    assert.deepEqual(triggerCounts(pairTriggers(meta)), {
      total: 4,
      listening: 3,
      running: 4,
      incomplete: 1,
    })
  })

  test('search matches the webhook source name and route', () => {
    const pairs = pairTriggers(meta)
    const names = (q: string) =>
      pairs.filter((p) => matchesTriggerQuery(p, q)).map((p) => p.name)
    assert.deepEqual(names('/webhooks/str'), ['stripe', 'stripe:invoice.paid'])
    assert.deepEqual(names('stripe'), ['stripe', 'stripe:invoice.paid'])
    assert.deepEqual(names('github'), ['github:push'])
    assert.equal(names('').length, 4)
  })

  test('the source panel opens with the webhook, tagged as one', () => {
    assert.deepEqual(sourcePanelMetadata(byName('stripe:invoice.paid')), {
      kind: 'webhook',
      source: 'stripe',
      event: 'invoice.paid',
      meta: stripe,
    })
    assert.deepEqual(sourcePanelMetadata(byName('orderPlaced')), {
      pikkuFuncId: 'orderSource',
    })
  })
})
