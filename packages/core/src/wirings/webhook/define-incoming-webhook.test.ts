import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defineIncomingWebhook,
  incomingWebhookRoute,
  upsertIncomingWebhooks,
  type IncomingWebhookMeta,
  type IncomingWebhookUpsertInput,
} from './define-incoming-webhook.js'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
} as any

const entry = (
  overrides: Partial<IncomingWebhookMeta> = {}
): IncomingWebhookMeta => ({
  id: 'stripe-eu:checkout',
  localId: 'checkout',
  instance: 'stripe-eu',
  package: '@pikku/addon-commerce-stripe',
  pikkuFuncId: 'stripe-eu:handleStripeWebhook',
  route: incomingWebhookRoute('checkout', 'stripe-eu'),
  events: ['checkout.session.completed'],
  secret: 'STRIPE_EU_WEBHOOK_SECRET',
  needs: { STRIPE_SECRET_KEY: 'STRIPE_EU_SECRET_KEY' },
  exportedName: 'checkout',
  ...overrides,
})

describe('incomingWebhookRoute', () => {
  test('scopes an addon route by instance', () => {
    assert.equal(
      incomingWebhookRoute('checkout', 'eu'),
      '/webhooks/eu/checkout'
    )
    assert.equal(incomingWebhookRoute('checkout'), '/webhooks/checkout')
  })
})

describe('upsertIncomingWebhooks', () => {
  test('hands upsert the url, label and declared secret names', async () => {
    let seen: IncomingWebhookUpsertInput<'STRIPE_SECRET_KEY'> | undefined
    const checkout = defineIncomingWebhook({
      id: 'checkout',
      func: { func: async () => {} },
      needs: ['STRIPE_SECRET_KEY'],
      upsert: async (input) => {
        seen = input
        return { status: 'created', secret: 'whsec_new' }
      },
    })

    const outcomes = await upsertIncomingWebhooks({
      definitions: { 'stripe-eu:checkout': checkout },
      meta: { 'stripe-eu:checkout': entry() },
      baseUrl: 'https://shop.example.com/api/',
      labelPrefix: 'pikku:shop:main',
      getSecret: async (name) =>
        name === 'STRIPE_EU_SECRET_KEY' ? 'sk_test_eu' : undefined,
      logger,
    })

    assert.equal(
      seen?.url,
      'https://shop.example.com/api/webhooks/stripe-eu/checkout'
    )
    assert.equal(seen?.label, 'pikku:shop:main:stripe-eu:checkout')
    assert.deepEqual(seen?.secrets, { STRIPE_SECRET_KEY: 'sk_test_eu' })
    assert.deepEqual(outcomes, [
      {
        id: 'stripe-eu:checkout',
        url: 'https://shop.example.com/api/webhooks/stripe-eu/checkout',
        status: 'created',
        secretName: 'STRIPE_EU_WEBHOOK_SECRET',
        secret: 'whsec_new',
      },
    ])
  })

  test('fails one webhook without stopping the rest', async () => {
    let called = 0
    const ok = defineIncomingWebhook({
      id: 'ok',
      func: { func: async () => {} },
      upsert: async () => {
        called++
        return { status: 'unchanged' }
      },
    })
    const throws = defineIncomingWebhook({
      id: 'throws',
      func: { func: async () => {} },
      upsert: async () => {
        throw new Error('provider down')
      },
    })

    const outcomes = await upsertIncomingWebhooks({
      definitions: { ok, throws },
      meta: {
        missing: entry({ id: 'missing' }),
        throws: entry({ id: 'throws', needs: {} }),
        ok: entry({ id: 'ok', needs: {} }),
      },
      baseUrl: 'https://x',
      labelPrefix: 'p',
      getSecret: async () => undefined,
      logger,
    })

    assert.equal(called, 1)
    assert.deepEqual(
      outcomes.map((o) => [o.id, o.status, o.error]),
      [
        ['missing', 'failed', "no definition was generated for 'missing'"],
        ['throws', 'failed', 'provider down'],
        ['ok', 'unchanged', undefined],
      ]
    )
  })

  test('reports a missing needed secret by its resolved name', async () => {
    const checkout = defineIncomingWebhook({
      id: 'checkout',
      func: { func: async () => {} },
      needs: ['STRIPE_SECRET_KEY'],
      upsert: async () => ({ status: 'unchanged' }),
    })

    const [outcome] = await upsertIncomingWebhooks({
      definitions: { 'stripe-eu:checkout': checkout },
      meta: { 'stripe-eu:checkout': entry() },
      baseUrl: 'https://x',
      labelPrefix: 'p',
      getSecret: async () => undefined,
      logger,
    })

    assert.equal(outcome?.status, 'failed')
    assert.equal(outcome?.error, 'missing STRIPE_EU_SECRET_KEY')
  })
})
