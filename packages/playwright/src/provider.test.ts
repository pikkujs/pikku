import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { PlaywrightScenarioBrowserProvider } from './provider.js'
import type { BrowserConfig } from './config.js'

const config = (overrides: Partial<BrowserConfig> = {}): BrowserConfig =>
  ({
    appUrl: 'https://app.test',
    apiUrl: 'https://app.test/api',
    timeout: 1_000,
    headed: false,
    slowMo: 0,
    ignoreHTTPSErrors: true,
    ...overrides,
  }) as BrowserConfig

/**
 * A stand-in for a real Playwright Browser: enough surface for the provider to
 * open a context and a page, so session identity is testable without launching
 * chromium.
 */
const fakeBrowser = () => {
  const contexts: Array<{ pages: number }> = []
  return {
    contexts,
    browser: {
      newContext: async () => {
        const context = { pages: 0 }
        contexts.push(context)
        return {
          addInitScript: async () => {},
          addCookies: async () => {},
          cookies: async () => [],
          clearCookies: async () => {},
          close: async () => {},
          newPage: async () => {
            context.pages += 1
            return {
              setDefaultTimeout: () => {},
              on: () => {},
              goto: async () => ({ status: () => 200 }),
              waitForSelector: async () => {},
              waitForTimeout: async () => {},
              screenshot: async () => new Uint8Array([1]),
              innerText: async () => '',
            }
          },
        }
      },
      close: async () => {},
      on: () => {},
    } as any,
  }
}

describe('PlaywrightScenarioBrowserProvider', () => {
  test('the same actor name resolves to the same session', async () => {
    const { browser, contexts } = fakeBrowser()
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: { shopper: { email: 'shopper@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
    })

    const first = await provider.sessionFor('shopper')
    const second = await provider.sessionFor('shopper')

    assert.equal(first, second, 'an actor keeps one window across its steps')
    assert.equal(contexts.length, 1, 'and one browser context')
  })

  test('distinct actors get distinct sessions and contexts', async () => {
    const { browser, contexts } = fakeBrowser()
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: {
        shopper: { email: 'shopper@test' },
        admin: { email: 'admin@test' },
      },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
    })

    const shopper = await provider.sessionFor('shopper')
    const admin = await provider.sessionFor('admin')

    assert.notEqual(shopper, admin)
    assert.equal(shopper.actor, 'shopper')
    assert.equal(admin.actor, 'admin')
    assert.equal(contexts.length, 2, 'two actors, two isolated cookie jars')
  })

  test('concurrent requests for one actor still open a single context', async () => {
    const { browser, contexts } = fakeBrowser()
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: { shopper: { email: 'shopper@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
    })

    const [a, b] = await Promise.all([
      provider.sessionFor('shopper'),
      provider.sessionFor('shopper'),
    ])

    assert.equal(a, b)
    assert.equal(contexts.length, 1)
  })

  test('an unregistered actor is a clear error, not a silent anonymous window', async () => {
    const { browser } = fakeBrowser()
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: { shopper: { email: 'shopper@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
    })

    await assert.rejects(
      provider.sessionFor('ghost'),
      /actor 'ghost' is not configured/
    )
  })

  test('the browser signs in through the actor path, as the actor', async () => {
    const { browser } = fakeBrowser()
    const signIns: Array<{ email: string; name: string; secret: string }> = []
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 'top-secret',
      actors: { shopper: { email: 'shopper@test', name: 'Shopper' } },
      connectBrowser: async () => ({ browser }),
      signIn: async (_context, request) => {
        signIns.push(request)
      },
    })

    await provider.sessionFor('shopper')
    await provider.sessionFor('shopper')

    assert.deepEqual(signIns, [
      { email: 'shopper@test', name: 'Shopper', secret: 'top-secret' },
    ])
  })

  test('close releases the browser exactly once and reopens on next use', async () => {
    const { browser } = fakeBrowser()
    let released = 0
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: {
        shopper: { email: 'shopper@test' },
        admin: { email: 'admin@test' },
      },
      connectBrowser: async () => ({
        browser,
        release: async () => {
          released++
        },
      }),
      signIn: async () => {},
    })

    await provider.sessionFor('shopper')
    await provider.sessionFor('admin')
    await provider.close()
    await provider.close()

    assert.equal(released, 1, 'a second close must not double-release')

    // After close, an actor gets a fresh session rather than a dead handle.
    const revived = await provider.sessionFor('shopper')
    assert.equal(revived.actor, 'shopper')
  })

  test('a browser the caller connected to is never closed by the provider', async () => {
    const { browser } = fakeBrowser()
    let browserClosed = 0
    browser.close = async () => {
      browserClosed++
    }
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: { shopper: { email: 'shopper@test' } },
      // No `release` — a shared/remote browser (CDP) belongs to whoever opened it.
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
    })

    await provider.sessionFor('shopper')
    await provider.close()

    assert.equal(browserClosed, 0)
  })
})
