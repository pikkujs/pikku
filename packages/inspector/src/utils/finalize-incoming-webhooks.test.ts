import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { getInitialInspectorState } from '../inspector.js'
import type { InspectorLogger } from '../types.js'
import { finalizeIncomingWebhooks } from './finalize-incoming-webhooks.js'

const makeLogger = (errors: string[]) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message: string) => errors.push(message),
    diagnostic: () => {},
    critical: (_code: string, message: string) => errors.push(message),
    hasCriticalErrors: () => false,
  }) as unknown as InspectorLogger

const published = {
  checkout: {
    id: 'checkout',
    localId: 'checkout',
    pikkuFuncId: 'handleStripeWebhook',
    route: '/webhooks/checkout',
    events: ['checkout.session.completed'],
    secret: 'STRIPE_WEBHOOK_SECRET',
    needs: { STRIPE_SECRET_KEY: 'STRIPE_SECRET_KEY' },
    exportedName: 'checkout',
    sourceFile: '/addon/src/webhooks.ts',
  },
}

const stateWithInstances = () => {
  const state = getInitialInspectorState('/app')
  for (const [namespace, secretOverrides] of [
    ['stripe-eu', { STRIPE_SECRET_KEY: 'STRIPE_EU_SECRET_KEY' }],
    ['stripe-us', undefined],
  ] as const) {
    state.rpc.wireAddonDeclarations.set(namespace, {
      package: '@pikku/addon-commerce-stripe',
      ...(secretOverrides ? { secretOverrides } : {}),
    } as never)
    state.addonFunctions[namespace] = {
      handleStripeWebhook: { pikkuFuncId: 'handleStripeWebhook' } as never,
    }
    state.addonIncomingWebhooks = {
      ...state.addonIncomingWebhooks,
      [namespace]: published,
    }
  }
  return state
}

describe('finalizeIncomingWebhooks', () => {
  test('scopes each addon instance and resolves its secrets', () => {
    const errors: string[] = []
    const state = stateWithInstances()
    finalizeIncomingWebhooks(makeLogger(errors), state, {
      incomingWebhooksWiringFile: '/app/.pikku/webhooks.gen.ts',
    })

    assert.deepEqual(errors, [])
    const eu = state.incomingWebhooksMeta?.['stripe-eu:checkout']
    assert.equal(eu?.route, '/webhooks/stripe-eu/checkout')
    assert.equal(eu?.pikkuFuncId, 'stripe-eu:handleStripeWebhook')
    assert.equal(eu?.instance, 'stripe-eu')
    assert.deepEqual(eu?.needs, { STRIPE_SECRET_KEY: 'STRIPE_EU_SECRET_KEY' })
    assert.equal(eu?.secret, 'STRIPE_WEBHOOK_SECRET')
    assert.equal(
      state.incomingWebhooksMeta?.['stripe-us:checkout']?.route,
      '/webhooks/stripe-us/checkout'
    )
    assert.equal(
      state.http.meta.post['/webhooks/stripe-eu/checkout']?.packageName,
      '@pikku/addon-commerce-stripe'
    )
  })

  test('refuses an app webhook named like an addon instance', () => {
    const errors: string[] = []
    const state = stateWithInstances()
    state.incomingWebhooks = [
      {
        file: '/app/src/webhooks.ts',
        variable: 'euHook',
        id: 'stripe-eu',
        pikkuFuncId: 'handle',
        events: [],
        needs: [],
      },
    ]
    finalizeIncomingWebhooks(makeLogger(errors), state, {})

    assert.match(errors[0] ?? '', /same name as a wired addon instance/)
    assert.equal(state.incomingWebhooksMeta?.['stripe-eu'], undefined)
  })
})
