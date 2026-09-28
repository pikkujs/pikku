import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import {
  resolveAddonFunctionTarget,
  resolveAddonScopes,
  wireAddon,
} from './wire-addon.js'

beforeEach(() => {
  resetPikkuState()
})

describe('wireAddon', () => {
  test('registers addon package metadata for namespace resolution', () => {
    wireAddon({
      name: 'stripe',
      package: '@addon/stripe',
      rpcEndpoint: 'https://rpc.example.com',
      auth: true,
      mcp: true,
      tags: ['payments', 'billing'],
      scopes: ['admin'],
      secretOverrides: { apiKey: 'STRIPE_API_KEY' },
      variableOverrides: { region: 'AWS_REGION' },
      credentialOverrides: { oauth: 'stripeOAuth' },
    })

    assert.deepEqual(pikkuState(null, 'addons', 'packages').get('stripe'), {
      package: '@addon/stripe',
      rpcEndpoint: 'https://rpc.example.com',
      auth: true,
      tags: ['payments', 'billing'],
      scopes: ['admin'],
      secretOverrides: { apiKey: 'STRIPE_API_KEY' },
      variableOverrides: { region: 'AWS_REGION' },
      credentialOverrides: { oauth: 'stripeOAuth' },
    })
  })

  test('overwrites existing addon config for the same namespace', () => {
    wireAddon({
      name: 'stripe',
      package: '@addon/stripe-v1',
      rpcEndpoint: 'https://rpc-v1.example.com',
      auth: false,
      tags: ['old'],
    })

    wireAddon({
      name: 'stripe',
      package: '@addon/stripe-v2',
      rpcEndpoint: 'https://rpc-v2.example.com',
      auth: true,
      tags: ['new'],
    })

    assert.deepEqual(pikkuState(null, 'addons', 'packages').get('stripe'), {
      package: '@addon/stripe-v2',
      rpcEndpoint: 'https://rpc-v2.example.com',
      auth: true,
      tags: ['new'],
    })
  })

  test('omits scopes entirely when none are declared', () => {
    wireAddon({ name: 'stripe', package: '@addon/stripe' })

    assert.equal(
      'scopes' in pikkuState(null, 'addons', 'packages').get('stripe')!,
      false
    )
  })
})

describe('resolveAddonFunctionTarget', () => {
  test('returns null for a name that is not namespaced', () => {
    wireAddon({ name: 'stripe', package: '@addon/stripe' })

    assert.equal(resolveAddonFunctionTarget('handleWebhook', null), null)
  })

  test('returns null when the namespace is not a wired addon', () => {
    assert.equal(resolveAddonFunctionTarget('stripe:handleWebhook', null), null)
  })

  // The regression: a `ref('ns:fn')` the consuming app wired arrives with no
  // instance of its own, so the target is where the runner learns which one to
  // run the function in. Returning only the package left it running with the
  // addon's declared secrets alone — the app's `secretOverrides` and grants
  // silently did not apply, and an app's global middleware running inside that
  // scope was denied a secret the app itself owns.
  test('carries the addon instance, not only its package', () => {
    wireAddon({
      name: 'shop',
      package: '@addon/stripe',
      secretOverrides: { apiKey: 'SHOP_STRIPE_KEY' },
      scopes: ['billing'],
    })

    const target = resolveAddonFunctionTarget('shop:handleWebhook', null)

    assert.equal(target?.packageName, '@addon/stripe')
    assert.equal(target?.localName, 'handleWebhook')
    assert.equal(target?.instance.namespace, 'shop')
    assert.deepEqual(target?.instance.secretOverrides, {
      apiKey: 'SHOP_STRIPE_KEY',
    })
    assert.deepEqual(target?.instance.scopes, ['billing'])
  })

  test('resolves each namespace to its own instance of the same package', () => {
    wireAddon({
      name: 'live',
      package: '@addon/stripe',
      secretOverrides: { apiKey: 'LIVE_KEY' },
    })
    wireAddon({
      name: 'test',
      package: '@addon/stripe',
      secretOverrides: { apiKey: 'TEST_KEY' },
    })

    const instance = resolveAddonFunctionTarget(
      'test:handleWebhook',
      null
    )?.instance

    assert.equal(instance?.namespace, 'test')
    assert.deepEqual(instance?.secretOverrides, { apiKey: 'TEST_KEY' })
  })

  test('refuses a target in another package when the wire runs inside an addon', () => {
    wireAddon({ name: 'shop', package: '@addon/stripe' })

    assert.equal(
      resolveAddonFunctionTarget('shop:handleWebhook', '@addon/mail'),
      null
    )
  })
})

describe('resolveAddonScopes', () => {
  test('returns nothing for a package that is not a wired addon', () => {
    wireAddon({ name: 'stripe', package: '@addon/stripe', scopes: ['admin'] })

    assert.deepEqual(resolveAddonScopes('@addon/other'), [])
    assert.deepEqual(resolveAddonScopes(null), [])
  })

  test('reads the scopes of the named namespace', () => {
    wireAddon({ name: 'live', package: '@addon/stripe', scopes: ['admin'] })
    wireAddon({ name: 'test', package: '@addon/stripe', scopes: ['sandbox'] })

    assert.deepEqual(resolveAddonScopes('@addon/stripe', 'live'), ['admin'])
    assert.deepEqual(resolveAddonScopes('@addon/stripe', 'test'), ['sandbox'])
  })

  test('unions every namespace when the caller has no namespace', () => {
    wireAddon({ name: 'live', package: '@addon/stripe', scopes: ['admin'] })
    wireAddon({ name: 'test', package: '@addon/stripe', scopes: ['sandbox'] })

    assert.deepEqual(resolveAddonScopes('@addon/stripe'), ['admin', 'sandbox'])
  })

  test('falls back to the package union when the namespace names another package', () => {
    wireAddon({ name: 'live', package: '@addon/stripe', scopes: ['admin'] })
    wireAddon({ name: 'mail', package: '@addon/mail' })

    assert.deepEqual(resolveAddonScopes('@addon/stripe', 'mail'), ['admin'])
  })
})
