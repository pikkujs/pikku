import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { MissingScopeError } from '../../errors/errors.js'
import { ContextAwareRPCService } from './rpc-runner.js'
import { wireAddon } from './wire-addon.js'

const ADDON_PACKAGE = '@addon/console'

const createServices = () =>
  ({
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  }) as never

const registerAddonFunction = (
  funcName: string,
  { scopes }: { scopes?: string[] } = {}
) => {
  addFunction(funcName, { func: async () => 'ok' } as never, ADDON_PACKAGE)
  pikkuState(ADDON_PACKAGE, 'function', 'meta')[funcName] = {
    name: funcName,
    sessionless: true,
    permissions: [],
    scopes,
  } as never
}

const session = (scopes?: string[]) => ({ userId: 'u1', scopes }) as never

/** How an addon function is reached over RPC: `namespace:function`. */
const callOverRPC = (namespacedFunction: string, sessionScopes?: string[]) => {
  const service = new ContextAwareRPCService(
    createServices(),
    { session: session(sessionScopes) } as never,
    { requiresAuth: false }
  )
  return service.rpc(namespacedFunction, {})
}

/**
 * How an addon function is reached over a directly-wired HTTP route: the
 * inspector records the addon package on the route meta and the HTTP runner
 * hands it to `runPikkuFunc`, never passing through namespace resolution.
 */
const callOverDirectWiring = (
  funcName: string,
  sessionScopes?: string[],
  wireType: string = 'http',
  wireId: string = 'get:/console/thing'
) =>
  runPikkuFunc(wireType as never, wireId, funcName, {
    singletonServices: createServices(),
    data: () => ({}),
    auth: false,
    packageName: ADDON_PACKAGE,
    wire: { session: session(sessionScopes) } as never,
  })

beforeEach(() => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', createServices())
})

describe('wireAddon scopes', () => {
  test('denies a session lacking the addon scope', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE, scopes: ['admin'] })
    registerAddonFunction('credentialGet')

    await assert.rejects(
      () => callOverRPC('console:credentialGet', ['billing:read']),
      MissingScopeError
    )
  })

  test('allows a session holding the addon scope', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE, scopes: ['admin'] })
    registerAddonFunction('credentialGet')

    assert.equal(await callOverRPC('console:credentialGet', ['admin']), 'ok')
  })

  test('denies a session with no scopes at all', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE, scopes: ['admin'] })
    registerAddonFunction('credentialGet')

    await assert.rejects(
      () => callOverRPC('console:credentialGet'),
      MissingScopeError
    )
  })

  test('unions addon scopes with the function’s own scopes', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE, scopes: ['admin'] })
    registerAddonFunction('installAddon', { scopes: ['packages:install'] })

    await assert.rejects(
      () => callOverRPC('console:installAddon', ['admin']),
      MissingScopeError
    )
    await assert.rejects(
      () => callOverRPC('console:installAddon', ['packages:install']),
      MissingScopeError
    )
    assert.equal(
      await callOverRPC('console:installAddon', ['admin', 'packages:install']),
      'ok'
    )
  })

  test('satisfies an addon scope through the scope hierarchy', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE, scopes: ['admin'] })
    registerAddonFunction('credentialGet')

    assert.equal(await callOverRPC('console:credentialGet', ['admin:*']), 'ok')
    assert.equal(await callOverRPC('console:credentialGet', ['*']), 'ok')
  })

  test('leaves an addon wired without scopes ungated', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE })
    registerAddonFunction('credentialGet')

    assert.equal(await callOverRPC('console:credentialGet', []), 'ok')
  })

  test('leaves the function’s own scopes intact on an unscoped addon', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE })
    registerAddonFunction('installAddon', { scopes: ['packages:install'] })

    await assert.rejects(
      () => callOverRPC('console:installAddon', ['admin']),
      MissingScopeError
    )
    assert.equal(
      await callOverRPC('console:installAddon', ['packages:install']),
      'ok'
    )
  })

  test('gates a directly-wired route into the addon package', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE, scopes: ['admin'] })
    registerAddonFunction('streamWorkflowRun')

    await assert.rejects(
      () => callOverDirectWiring('streamWorkflowRun', ['billing:read']),
      MissingScopeError
    )
    assert.equal(
      await callOverDirectWiring('streamWorkflowRun', ['admin']),
      'ok'
    )
  })

  test('gates a directly-wired route when the package is wired under several namespaces', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE, scopes: ['admin'] })
    wireAddon({ name: 'consoleReadonly', package: ADDON_PACKAGE })
    registerAddonFunction('streamWorkflowRun')

    await assert.rejects(
      () => callOverDirectWiring('streamWorkflowRun', []),
      MissingScopeError
    )
  })

  test('leaves a directly-wired route into an unscoped addon package ungated', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE })
    registerAddonFunction('streamWorkflowRun')

    assert.equal(await callOverDirectWiring('streamWorkflowRun', []), 'ok')
  })

  test('gates every wiring kind, not just http', async () => {
    // The inspector writes the addon package onto all of these, and each
    // runner calls runPikkuFunc without ever resolving a namespace.
    const wireTypes = [
      'http',
      'channel',
      'queue',
      'scheduler',
      'cli',
      'mcp',
      'trigger',
      'gateway',
    ]

    wireAddon({ name: 'console', package: ADDON_PACKAGE, scopes: ['admin'] })
    registerAddonFunction('streamWorkflowRun')

    for (const wireType of wireTypes) {
      await assert.rejects(
        () =>
          callOverDirectWiring(
            'streamWorkflowRun',
            ['billing:read'],
            wireType,
            `${wireType}:console`
          ),
        MissingScopeError,
        `${wireType} did not gate on the addon scope`
      )
      assert.equal(
        await callOverDirectWiring(
          'streamWorkflowRun',
          ['admin'],
          wireType,
          `${wireType}:console`
        ),
        'ok',
        `${wireType} rejected a session holding the addon scope`
      )
    }
  })

  test('leaves a non-addon package untouched', async () => {
    registerAddonFunction('streamWorkflowRun')

    assert.equal(await callOverDirectWiring('streamWorkflowRun', []), 'ok')
  })
})
