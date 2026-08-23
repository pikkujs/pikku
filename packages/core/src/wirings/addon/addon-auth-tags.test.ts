import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  addTagMiddleware,
  clearMiddlewareCache,
} from '../../middleware-runner.js'
import { ForbiddenError, MissingSessionError } from '../../errors/errors.js'
import { resolveAddonAuth, resolveAddonTags, wireAddon } from './wire-addon.js'

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

const registerAddonFunction = (funcName: string) => {
  addFunction(funcName, { func: async () => 'ok' } as never, ADDON_PACKAGE)
  pikkuState(ADDON_PACKAGE, 'function', 'meta')[funcName] = {
    name: funcName,
    sessionless: true,
    permissions: [],
  } as never
}

const session = () => ({ userId: 'u1' }) as never

/**
 * How an addon function is reached over a directly-wired route: the inspector
 * records the addon package on the wiring meta and the runner hands it to
 * `runPikkuFunc`, never passing through namespace resolution.
 */
const callOverDirectWiring = (
  funcName: string,
  {
    wireType = 'http',
    withSession = false,
    auth,
  }: {
    wireType?: string
    withSession?: boolean
    auth?: boolean
  } = {}
) =>
  runPikkuFunc(wireType as never, `${wireType}:/console/thing`, funcName, {
    singletonServices: createServices(),
    data: () => ({}),
    auth,
    packageName: ADDON_PACKAGE,
    wire: (withSession ? { session: session() } : {}) as never,
  })

beforeEach(() => {
  resetPikkuState()
  // resetPikkuState deliberately leaves runtime caches alone; combineMiddleware
  // keys its cache on wireType/wireId, which these tests reuse.
  clearMiddlewareCache()
  pikkuState(null, 'package', 'singletonServices', createServices())
})

describe('resolveAddonAuth', () => {
  test('is false for a non-addon package', () => {
    assert.equal(resolveAddonAuth(null), false)
    assert.equal(resolveAddonAuth('@addon/other'), false)
  })

  test('reads the named instance when one is resolved', () => {
    wireAddon({ name: 'live', package: ADDON_PACKAGE, auth: true })
    wireAddon({ name: 'test', package: ADDON_PACKAGE, auth: false })

    assert.equal(resolveAddonAuth(ADDON_PACKAGE, 'live'), true)
    assert.equal(resolveAddonAuth(ADDON_PACKAGE, 'test'), false)
  })

  test('takes the stricter reading across namespaces on the unnamed path', () => {
    wireAddon({ name: 'live', package: ADDON_PACKAGE, auth: true })
    wireAddon({ name: 'test', package: ADDON_PACKAGE, auth: false })

    assert.equal(resolveAddonAuth(ADDON_PACKAGE), true)
  })
})

describe('resolveAddonTags', () => {
  test('unions tags across every namespace the package is wired under', () => {
    wireAddon({ name: 'live', package: ADDON_PACKAGE, tags: ['admin'] })
    wireAddon({ name: 'test', package: ADDON_PACKAGE, tags: ['sandbox'] })

    assert.deepEqual(resolveAddonTags(ADDON_PACKAGE).sort(), [
      'admin',
      'sandbox',
    ])
  })

  test('reads the named instance exactly when one is resolved', () => {
    wireAddon({ name: 'live', package: ADDON_PACKAGE, tags: ['admin'] })
    wireAddon({ name: 'test', package: ADDON_PACKAGE, tags: ['sandbox'] })

    assert.deepEqual(resolveAddonTags(ADDON_PACKAGE, 'live'), ['admin'])
  })
})

describe('wireAddon auth on direct wirings', () => {
  test('requires a session for a sessionless addon function', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE, auth: true })
    registerAddonFunction('credentialGet')

    await assert.rejects(
      () => callOverDirectWiring('credentialGet'),
      MissingSessionError
    )
  })

  test('allows the call once a session is present', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE, auth: true })
    registerAddonFunction('credentialGet')

    assert.equal(
      await callOverDirectWiring('credentialGet', { withSession: true }),
      'ok'
    )
  })

  test('leaves an addon wired without auth ungated', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE })
    registerAddonFunction('credentialGet')

    assert.equal(await callOverDirectWiring('credentialGet'), 'ok')
  })

  test('does not weaken a wiring that already requires auth', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE, auth: false })
    registerAddonFunction('credentialGet')

    await assert.rejects(
      () => callOverDirectWiring('credentialGet', { auth: true }),
      MissingSessionError
    )
  })

  test('gates every wiring kind, not just http', async () => {
    wireAddon({ name: 'console', package: ADDON_PACKAGE, auth: true })
    registerAddonFunction('credentialGet')

    for (const wireType of [
      'http',
      'channel',
      'queue',
      'scheduler',
      'cli',
      'mcp',
      'trigger',
      'gateway',
    ]) {
      await assert.rejects(
        () => callOverDirectWiring('credentialGet', { wireType }),
        MissingSessionError,
        `${wireType} should have been gated`
      )
    }
  })
})

describe('wireAddon tags on direct wirings', () => {
  test('runs middleware the app registered for the addon tag', async () => {
    const seen: string[] = []
    addTagMiddleware('admin', [
      (async (_services: never, _wire: never, next: () => Promise<void>) => {
        seen.push('admin')
        await next()
      }) as never,
    ])

    wireAddon({ name: 'console', package: ADDON_PACKAGE, tags: ['admin'] })
    registerAddonFunction('credentialGet')

    assert.equal(await callOverDirectWiring('credentialGet'), 'ok')
    assert.deepEqual(seen, ['admin'])
  })

  test('lets that middleware reject the call', async () => {
    addTagMiddleware('admin', [
      (async () => {
        throw new ForbiddenError('nope')
      }) as never,
    ])

    wireAddon({ name: 'console', package: ADDON_PACKAGE, tags: ['admin'] })
    registerAddonFunction('credentialGet')

    await assert.rejects(
      () => callOverDirectWiring('credentialGet'),
      ForbiddenError
    )
  })

  test('leaves an addon wired without tags alone', async () => {
    const seen: string[] = []
    addTagMiddleware('admin', [
      (async (_services: never, _wire: never, next: () => Promise<void>) => {
        seen.push('admin')
        await next()
      }) as never,
    ])

    wireAddon({ name: 'console', package: ADDON_PACKAGE })
    registerAddonFunction('credentialGet')

    assert.equal(await callOverDirectWiring('credentialGet'), 'ok')
    assert.deepEqual(seen, [])
  })
})
