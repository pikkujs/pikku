import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { resolveAddonScopes, wireAddon } from './wire-addon.js'

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
