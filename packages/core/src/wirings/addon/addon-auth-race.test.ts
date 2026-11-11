import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { getOrCreatePackageSingletonServices } from './addon-runner.js'
import type { CoreSingletonServices } from '../../types/core.types.js'

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const ADDON = '@addon/cloud'

/**
 * What the generated `pikkuServices` wrapper does around an app factory that
 * publishes its services and starts its queue consumers before returning: the
 * graph is reachable from `pikkuState` without `auth`, which the wrapper only
 * attaches once the factory has returned.
 */
const startApp = async (onPublished: () => Promise<void>) => {
  const authInstance = { api: { createApiKey: async () => ({ key: 'k' }) } }
  pikkuState(null, 'package', 'authFactory', async () => authInstance)
  const created = { logger } as unknown as CoreSingletonServices
  pikkuState(null, 'package', 'singletonServices', created)
  await onPublished()
  const authFactory = pikkuState(null, 'package', 'authFactory')!
  let pending: Promise<unknown> | undefined
  const resolved = {
    ...created,
    auth: () => (pending ??= Promise.resolve(authFactory(resolved))),
  } as CoreSingletonServices
  pikkuState(null, 'package', 'singletonServices', resolved)
  return { resolved, authInstance }
}

describe('addon services built while the app is still creating its own', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'addons', 'packages').set('cloud', { package: ADDON })
    pikkuState(ADDON, 'package', 'factories', {
      createSingletonServices: async (_config: unknown, existing: any) => ({
        ...existing,
      }),
    } as never)
  })

  test('a job that runs before the wrapper attaches auth still reaches auth', async () => {
    let addonServices: CoreSingletonServices | undefined
    const { resolved, authInstance } = await startApp(async () => {
      addonServices = await getOrCreatePackageSingletonServices(
        ADDON,
        pikkuState(null, 'package', 'singletonServices')!
      )
    })

    assert.equal(typeof addonServices!.auth, 'function')
    assert.equal(await addonServices!.auth!(), authInstance)

    const later = await getOrCreatePackageSingletonServices(ADDON, resolved)
    assert.equal(later, addonServices)
    assert.equal(await later.auth!(), await resolved.auth!())
  })

  test('auth called inside the window says the services are not ready', async () => {
    await startApp(async () => {
      const services = await getOrCreatePackageSingletonServices(
        ADDON,
        pikkuState(null, 'package', 'singletonServices')!
      )
      await assert.rejects(
        async () => services.auth!(),
        /before the app had finished/
      )
    })
  })

  test('a project without auth gets no auth', async () => {
    pikkuState(null, 'package', 'singletonServices', {
      logger,
    } as unknown as CoreSingletonServices)
    const services = await getOrCreatePackageSingletonServices(
      ADDON,
      pikkuState(null, 'package', 'singletonServices')!
    )
    assert.equal(services.auth, undefined)
  })

  test("the parent's own auth is kept", async () => {
    const auth = async () => ({ own: true }) as never
    pikkuState(null, 'package', 'authFactory', async () => ({}))
    const parent = { logger, auth } as unknown as CoreSingletonServices
    const services = await getOrCreatePackageSingletonServices(ADDON, parent)
    assert.equal(services.auth, auth)
  })
})
