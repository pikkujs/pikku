import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveScenarioBrowserProvider,
  scenarioBrowserLifecycle,
} from './scenario-browser.js'
import type { ScenarioBrowserProvider } from '@pikku/core/scenario'

const stubProvider = (
  overrides: Partial<ScenarioBrowserProvider> = {}
): ScenarioBrowserProvider => ({
  sessionFor: async () => ({}) as any,
  close: async () => {},
  ...overrides,
})

describe('scenarioBrowserLifecycle', () => {
  test('a run with no browser at all has a lifecycle that does nothing', async () => {
    const lifecycle = scenarioBrowserLifecycle(undefined)

    await lifecycle.reset()
    await lifecycle.close()
    assert.deepEqual(await lifecycle.captureFailure('someScenario'), [])
  })

  test('a driver predating isolation still runs, it just offers none', async () => {
    let closed = 0
    // No `reset`, no `captureFailure` — the shape a third-party driver written
    // against the earlier interface has.
    const lifecycle = scenarioBrowserLifecycle(
      stubProvider({
        close: async () => {
          closed++
        },
      })
    )

    await lifecycle.reset()
    assert.deepEqual(await lifecycle.captureFailure('someScenario'), [])
    await lifecycle.close()

    assert.equal(closed, 1, 'close is not optional and must still be called')
  })

  test('reset is delegated to the driver', async () => {
    const resets: number[] = []
    const lifecycle = scenarioBrowserLifecycle(
      stubProvider({
        reset: async () => {
          resets.push(1)
        },
      })
    )

    await lifecycle.reset()
    await lifecycle.reset()

    assert.equal(resets.length, 2)
  })

  test('a driver that cannot reset fails loudly rather than running a contaminated scenario', async () => {
    const lifecycle = scenarioBrowserLifecycle(
      stubProvider({
        reset: async () => {
          throw new Error('browser has been closed')
        },
      })
    )

    await assert.rejects(lifecycle.reset(), /browser has been closed/)
  })

  test('captured failures reach the reporter with the scenario label', async () => {
    const labels: string[] = []
    const lifecycle = scenarioBrowserLifecycle(
      stubProvider({
        captureFailure: async (label) => {
          labels.push(label)
          return [
            {
              actor: 'admin',
              url: 'https://app.test/console',
              consoleErrors: ['boom'],
              pageErrors: [],
              failedRequests: [],
              apiErrors: [],
            },
          ]
        },
      })
    )

    const failures = await lifecycle.captureFailure('code editor › edits')

    assert.deepEqual(labels, ['code editor › edits'])
    assert.equal(failures[0]?.consoleErrors[0], 'boom')
  })

  test('a driver that throws while capturing never replaces the failure being captured', async () => {
    const lifecycle = scenarioBrowserLifecycle(
      stubProvider({
        captureFailure: async () => {
          throw new Error('target page has been closed')
        },
      })
    )

    assert.deepEqual(await lifecycle.captureFailure('someScenario'), [])
  })
})

describe('resolveScenarioBrowserProvider', () => {
  const driver = () => {
    const built: any[] = []
    return {
      built,
      importDriver: async () => ({
        PlaywrightScenarioBrowserProvider: class {
          constructor(options: any) {
            built.push(options)
          }
          async sessionFor() {
            return {} as any
          }
          async close() {}
        } as any,
        browserConfigFromEnv: (overrides: any) => ({ ...overrides }) as any,
      }),
    }
  }

  const options = (overrides: Record<string, unknown> = {}) => ({
    environment: 'local',
    apiUrl: 'http://localhost:4077',
    appUrl: 'http://localhost:4077/console',
    secret: 'top-secret',
    actors: { admin: { email: 'admin@test' } },
    capture: {
      dir: '/project/.pikku/scenario-runs',
      runId: 'run-1',
      video: 'failed' as const,
    },
    browserScenarios: ['codeEditorScenario'],
    ...overrides,
  })

  test('an environment with browser steps but no appUrl fails before a scenario runs', async () => {
    await assert.rejects(
      resolveScenarioBrowserProvider({
        ...options({ appUrl: undefined }),
        importDriver: driver().importDriver,
      } as any),
      /environment 'local' has browser steps but no 'appUrl'[\s\S]*--app-url/
    )
  })

  test('a driver that knows the target from its own environment supplies the appUrl', async () => {
    let seen: any
    await resolveScenarioBrowserProvider({
      ...options({ appUrl: undefined }),
      driver: '@acme/sandbox-driver',
      importDriver: async () => ({
        // The sandbox case: the driver reads a hostname nothing in the config
        // could have known.
        browserConfigFromEnv: (overrides: any) => ({
          ...overrides,
          appUrl: overrides.appUrl ?? 'https://sandbox-a1b2.example.com',
          appUrlSource: overrides.appUrl ? 'override' : 'env',
        }),
        createScenarioBrowserProvider: (opts: any) => {
          seen = opts
          return { sessionFor: async () => ({}) as any, close: async () => {} }
        },
      }),
    } as any)

    assert.equal(seen.config.appUrl, 'https://sandbox-a1b2.example.com')
  })

  test('the app urls reach the driver, so each actor browses their own', async () => {
    const d = driver()
    await resolveScenarioBrowserProvider({
      ...options({
        appUrls: {
          workshop: 'http://localhost:4077/',
          storefront: 'http://localhost:4077/_frontend/storefront/',
        },
        actors: {
          mechanic: { email: 'mechanic@test', app: 'workshop' },
          customer: { email: 'customer@test', app: 'storefront' },
        },
      }),
      importDriver: d.importDriver,
    } as any)

    assert.deepEqual(d.built[0].config.appUrls, {
      workshop: 'http://localhost:4077/',
      storefront: 'http://localhost:4077/_frontend/storefront/',
    })
  })

  test('an app nobody gave a url for is refused, not quietly browsed as another app', async () => {
    await assert.rejects(
      resolveScenarioBrowserProvider({
        ...options({
          appUrls: { workshop: 'http://localhost:4077/' },
          actors: {
            mechanic: { email: 'mechanic@test', app: 'workshop' },
            customer: { email: 'customer@test', app: 'storefront' },
          },
        }),
        importDriver: driver().importDriver,
      } as any),
      /No app url for 'storefront'[\s\S]*--app-url storefront=<url>/
    )
  })

  test('with no app urls at all, one appUrl covers everybody as it always did', async () => {
    const d = driver()
    await resolveScenarioBrowserProvider({
      ...options({
        actors: { mechanic: { email: 'mechanic@test', app: 'workshop' } },
      }),
      importDriver: d.importDriver,
    } as any)

    assert.equal(d.built[0].config.appUrl, 'http://localhost:4077/console')
  })

  test('a driver falling back to its own placeholder is reported as a missing appUrl', async () => {
    await assert.rejects(
      resolveScenarioBrowserProvider({
        ...options({ appUrl: undefined }),
        driver: '@acme/sandbox-driver',
        importDriver: async () => ({
          browserConfigFromEnv: () => ({
            appUrl: 'http://localhost:5001',
            appUrlSource: 'default',
          }),
          createScenarioBrowserProvider: () => ({
            sessionFor: async () => ({}) as any,
            close: async () => {},
          }),
        }),
      } as any),
      /environment 'local' has browser steps but no 'appUrl'[\s\S]*resolved none from the environment/
    )
  })

  test('the configured appUrl still wins over anything the driver would resolve', async () => {
    let seen: any
    await resolveScenarioBrowserProvider({
      ...options(),
      driver: '@acme/sandbox-driver',
      importDriver: async () => ({
        browserConfigFromEnv: (overrides: any) => ({
          appUrl: overrides.appUrl ?? 'https://sandbox-a1b2.example.com',
          appUrlSource: overrides.appUrl ? 'override' : 'env',
        }),
        createScenarioBrowserProvider: (opts: any) => {
          seen = opts
          return { sessionFor: async () => ({}) as any, close: async () => {} }
        },
      }),
    } as any)

    assert.equal(seen.config.appUrl, 'http://localhost:4077/console')
  })

  test('a missing driver names the scenarios that needed it and how to install it', async () => {
    await assert.rejects(
      resolveScenarioBrowserProvider({
        ...options(),
        importDriver: async () => {
          throw new Error('Cannot find module')
        },
      } as any),
      /codeEditorScenario.*'@pikku\/playwright' could not be loaded[\s\S]*yarn add -D/
    )
  })

  test('any package exporting a provider factory can drive the browser', async () => {
    const provider = {
      sessionFor: async () => ({}) as any,
      close: async () => {},
    }
    const loaded: string[] = []

    const resolved = await resolveScenarioBrowserProvider({
      ...options(),
      driver: '@acme/puppeteer-driver',
      importDriver: async (specifier: string) => {
        loaded.push(specifier)
        return { createScenarioBrowserProvider: () => provider }
      },
    } as any)

    assert.deepEqual(loaded, ['@acme/puppeteer-driver'])
    assert.equal(
      resolved,
      provider,
      'playwright is a default, not a dependency'
    )
  })

  test('a driver with no browser config of its own still gets the urls', async () => {
    let seen: any
    await resolveScenarioBrowserProvider({
      ...options(),
      driver: '@acme/minimal-driver',
      importDriver: async () => ({
        createScenarioBrowserProvider: (opts: any) => {
          seen = opts
          return { sessionFor: async () => ({}) as any, close: async () => {} }
        },
      }),
    } as any)

    assert.deepEqual(seen.config, {
      appUrl: 'http://localhost:4077/console',
      apiUrl: 'http://localhost:4077',
    })
  })

  test('a driver with no config of its own cannot rescue a missing appUrl', async () => {
    await assert.rejects(
      resolveScenarioBrowserProvider({
        ...options({ appUrl: undefined }),
        driver: '@acme/minimal-driver',
        importDriver: async () => ({
          createScenarioBrowserProvider: () => ({
            sessionFor: async () => ({}) as any,
            close: async () => {},
          }),
        }),
      } as any),
      /environment 'local' has browser steps but no 'appUrl'/
    )
  })

  test('a package that is not a driver at all says so, rather than crashing later', async () => {
    await assert.rejects(
      resolveScenarioBrowserProvider({
        ...options(),
        driver: '@acme/not-a-driver',
        importDriver: async () => ({ somethingElse: true }) as any,
      } as any),
      /is not a scenario browser driver[\s\S]*sessionFor\(\) and close\(\)/
    )
  })

  test('the driver is built with the run’s capture options and its own actors', async () => {
    const { built, importDriver } = driver()

    await resolveScenarioBrowserProvider({
      ...options(),
      importDriver,
    } as any)

    assert.equal(built.length, 1)
    assert.deepEqual(built[0].capture, {
      dir: '/project/.pikku/scenario-runs',
      runId: 'run-1',
      video: 'failed',
    })
    assert.equal(built[0].secret, 'top-secret')
    assert.deepEqual(built[0].actors, { admin: { email: 'admin@test' } })
    assert.equal(built[0].config.appUrl, 'http://localhost:4077/console')
  })
})
