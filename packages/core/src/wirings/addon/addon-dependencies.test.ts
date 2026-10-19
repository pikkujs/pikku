import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { addFunction } from '../../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { AddonNotUsedError, ContextAwareRPCService } from '../rpc/rpc-runner.js'
import { createAgentRPC } from '../agent/agent-rpc.js'
import { wireAddon } from './wire-addon.js'
import { wireRemoteAddon } from './wire-remote-addon.js'
import { mapAddonCall } from './addon-reach.js'

/**
 * An addon calls another by the alias its package.json declares
 * (`pikku.uses: { stripe: '@acme/addon-stripe@^0.12.0' }`), and the host maps
 * the alias to whatever it wired, locally or remotely. The addon's code and its
 * types do not change with the transport; what it may reach does not grow with
 * what the host happens to have wired.
 */

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const registerFunction = (funcName: string, packageName: string) => {
  addFunction(funcName, { func: async () => funcName } as never, packageName)
  pikkuState(packageName, 'function', 'meta')[funcName] = {
    name: funcName,
    sessionless: true,
    permissions: [],
  } as never
}

const started: string[] = []

const billing = () =>
  new ContextAwareRPCService(
    {
      logger,
      workflowService: {
        startWorkflow: async (name: string) => {
          started.push(name)
          return { runId: 'r' }
        },
      },
    } as never,
    {
      wireType: 'http',
      wireId: 'billing',
      addonNamespace: 'billing',
    } as never,
    { requiresAuth: false },
    '@acme/addon-billing'
  )

describe('an addon calls another by the alias it declared', () => {
  beforeEach(() => {
    resetPikkuState()
    started.length = 0
    pikkuState(null, 'package', 'singletonServices', { logger } as never)
    registerFunction('charge', '@acme/addon-stripe')
    registerFunction('reveal', '@acme/addon-vault')
    wireAddon({ name: 'vault', package: '@acme/addon-vault' })
  })

  test('the alias reaches the local instance the host mapped it to', async () => {
    wireAddon({ name: 'payments', package: '@acme/addon-stripe' })
    wireAddon({
      name: 'billing',
      package: '@acme/addon-billing',
      uses: { stripe: 'payments' },
    })
    assert.equal(await billing().rpc('stripe:charge', {}), 'charge')
    assert.equal(
      await billing().rpcWithWire('stripe:charge', {}, {} as never),
      'charge'
    )
    await billing().startWorkflow('stripe:refund', {})
    assert.deepEqual(started, ['payments:refund'])
  })

  describe('the same alias, wired remotely', () => {
    const realFetch = globalThis.fetch
    const urls: string[] = []

    beforeEach(() => {
      urls.length = 0
      globalThis.fetch = (async (url: unknown) => {
        urls.push(String(url))
        return { ok: true, status: 200, text: async () => '"remote-charge"' }
      }) as never
    })

    afterEach(() => {
      globalThis.fetch = realFetch
    })

    test('reaches the remote instance, with no change to the call', async () => {
      wireRemoteAddon({
        name: 'payments',
        package: '@acme/addon-stripe',
        serverUrl: 'https://stripe.example.com',
      })
      wireAddon({
        name: 'billing',
        package: '@acme/addon-billing',
        uses: { stripe: 'payments' },
      })
      assert.equal(await billing().rpc('stripe:charge', {}), 'remote-charge')
      assert.deepEqual(urls, ['https://stripe.example.com/rpc/charge'])
    })
  })

  describe('the host granting less than the addon declared', () => {
    beforeEach(() => {
      wireAddon({ name: 'payments', package: '@acme/addon-stripe' })
      // billing declared `stripe`, the host mapped nothing.
      wireAddon({ name: 'billing', package: '@acme/addon-billing' })
    })

    test('refuses the call through invoke', async () => {
      await assert.rejects(
        () => billing().rpc('stripe:charge', {}),
        AddonNotUsedError
      )
      await assert.rejects(
        () => billing().rpcWithWire('stripe:charge', {}, {} as never),
        AddonNotUsedError
      )
    })

    test('refuses to start a workflow, and nothing starts', async () => {
      await assert.rejects(
        () => billing().startWorkflow('stripe:refund', {}),
        AddonNotUsedError
      )
      assert.deepEqual(started, [])
    })

    test('refuses to run or stream an agent', async () => {
      const agent = createAgentRPC(
        { addonNamespace: 'billing' } as never,
        {} as never
      )
      await assert.rejects(
        () => agent.run('stripe:support', { message: 'hi' } as never),
        AddonNotUsedError
      )
      await assert.rejects(
        () =>
          agent.stream('stripe:support', {
            message: 'hi',
            threadId: 't',
            resourceId: 'r',
          }),
        AddonNotUsedError
      )
    })

    test('does not let the addon reach the target by its wired name instead', async () => {
      await assert.rejects(
        () => billing().rpc('payments:charge', {}),
        AddonNotUsedError
      )
    })
  })

  test("an agent call is mapped like any other: the alias names the host's instance", () => {
    wireAddon({
      name: 'billing',
      package: '@acme/addon-billing',
      uses: { stripe: 'payments' },
    })
    assert.equal(mapAddonCall('billing', 'stripe:support'), 'payments:support')
    assert.equal(mapAddonCall('billing', 'billing:own'), 'billing:own')
    assert.equal(mapAddonCall(undefined, 'stripe:support'), 'stripe:support')
    assert.throws(() => mapAddonCall('billing', 'vault:x'), AddonNotUsedError)
  })
})
