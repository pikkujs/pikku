import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { findWebhookSource, webhookSecretName } from './webhook-source.js'

const stripe = {
  name: 'stripe',
  method: 'post' as const,
  route: '/webhooks/stripe',
  events: ['invoice.paid'],
}

describe('webhook trigger sources', () => {
  test('a `<source>:<event>` trigger pairs with its webhook source', () => {
    assert.deepEqual(findWebhookSource('stripe:invoice.paid', { stripe }), {
      source: 'stripe',
      event: 'invoice.paid',
      meta: stripe,
    })
  })

  test('a bare source name pairs with no event', () => {
    assert.equal(findWebhookSource('stripe', { stripe })?.event, '')
  })

  test('an unknown source pairs with nothing', () => {
    assert.equal(findWebhookSource('github:push', { stripe }), null)
    assert.equal(findWebhookSource('stripe:invoice.paid', undefined), null)
  })

  test('the signing secret is named after the source', () => {
    assert.equal(webhookSecretName('stripe'), 'stripeWebhookSecret')
  })
})
