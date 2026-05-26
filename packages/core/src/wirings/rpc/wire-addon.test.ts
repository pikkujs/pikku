import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { wireAddon } from './wire-addon.js'

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
      secretOverrides: { apiKey: 'secretName' },
      variableOverrides: { region: 'eu-west-1' },
      credentialOverrides: { oauth: 'credentialName' },
    })

    assert.deepEqual(pikkuState(null, 'addons', 'packages').get('stripe'), {
      package: '@addon/stripe',
      rpcEndpoint: 'https://rpc.example.com',
      auth: true,
      tags: ['payments', 'billing'],
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
})
