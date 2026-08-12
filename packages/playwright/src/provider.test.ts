import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  const contexts: Array<{ pages: number; closed: boolean }> = []
  const screenshots: Array<string | undefined> = []
  return {
    contexts,
    screenshots,
    browser: {
      newContext: async () => {
        const context = { pages: 0, closed: false }
        contexts.push(context)
        return {
          addInitScript: async () => {},
          addCookies: async () => {},
          cookies: async () => [],
          clearCookies: async () => {},
          close: async () => {
            context.closed = true
          },
          newPage: async () => {
            context.pages += 1
            return {
              setDefaultTimeout: () => {},
              on: () => {},
              url: () => 'https://app.test/console/functions',
              goto: async () => ({ status: () => 200 }),
              waitForSelector: async () => {},
              waitForTimeout: async () => {},
              screenshot: async (options?: { path?: string }) => {
                screenshots.push(options?.path)
                return new Uint8Array([1])
              },
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
      /browser actor 'ghost' has no persona/
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

  test('reset closes every actor context, so the next scenario starts signed out', async () => {
    const { browser, contexts } = fakeBrowser()
    const signIns: string[] = []
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: {
        shopper: { email: 'shopper@test' },
        admin: { email: 'admin@test' },
      },
      connectBrowser: async () => ({ browser }),
      signIn: async (_context, request) => {
        signIns.push(request.email)
      },
    })

    const before = await provider.sessionFor('shopper')
    await provider.sessionFor('admin')
    await provider.reset()

    assert.deepEqual(
      contexts.map((c) => c.closed),
      [true, true],
      'both actors lose their cookie jar, storage and pages'
    )

    const after = await provider.sessionFor('shopper')
    assert.notEqual(after, before, 'the next scenario gets a fresh session')
    assert.equal(contexts.length, 3, 'and a fresh context')
    assert.deepEqual(
      signIns,
      ['shopper@test', 'admin@test', 'shopper@test'],
      'a reset actor signs in again rather than inheriting a stale cookie'
    )
  })

  test('reset keeps the browser connection, so chromium is launched once per run', async () => {
    const { browser } = fakeBrowser()
    let connects = 0
    let released = 0
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: { shopper: { email: 'shopper@test' } },
      connectBrowser: async () => {
        connects++
        return {
          browser,
          release: async () => {
            released++
          },
        }
      },
      signIn: async () => {},
    })

    await provider.sessionFor('shopper')
    await provider.reset()
    await provider.sessionFor('shopper')
    await provider.reset()
    await provider.sessionFor('shopper')

    assert.equal(connects, 1, 'reset is not a relaunch')
    assert.equal(released, 0, 'and never releases the browser')

    await provider.close()
    assert.equal(released, 1, 'only close releases it')
  })

  test('captureFailure reports each open actor window, with its page issues', async () => {
    const { browser } = fakeBrowser()
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

    const admin = await provider.sessionFor('admin')
    // What ActorSession collects during a navigation, and today discards.
    ;(admin as any).issues.consoleErrors.push('TypeError: x is not a function')
    ;(admin as any).issues.apiErrors.push('500 /api/rpc/console:readSource')

    const failures = await provider.captureFailure('codeEditorScenario')

    assert.equal(failures.length, 1, 'only actors with an open window')
    const [failure] = failures
    assert.equal(failure!.actor, 'admin')
    assert.equal(failure!.url, 'https://app.test/console/functions')
    assert.deepEqual(failure!.consoleErrors, ['TypeError: x is not a function'])
    assert.deepEqual(failure!.apiErrors, ['500 /api/rpc/console:readSource'])
  })

  test('captureFailure writes a screenshot per actor when a failureDir is set', async () => {
    const { browser, screenshots } = fakeBrowser()
    const failureDir = await mkdtemp(join(tmpdir(), 'pikku-failures-'))
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      failureDir,
    })

    await provider.sessionFor('admin')
    const [failure] = await provider.captureFailure('code editor › edits')

    assert.equal(
      failure!.screenshot,
      join(failureDir, 'code-editor-edits-admin.png'),
      'the label is slugged so it is a usable filename'
    )
    assert.deepEqual(screenshots, [failure!.screenshot])
    await rm(failureDir, { recursive: true, force: true })
  })

  test('a screenshot that fails never masks the failure being reported', async () => {
    const { browser } = fakeBrowser()
    const failureDir = await mkdtemp(join(tmpdir(), 'pikku-failures-'))
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      failureDir,
    })

    const admin = await provider.sessionFor('admin')
    admin.page.screenshot = async () => {
      throw new Error('target page, context or browser has been closed')
    }

    const [failure] = await provider.captureFailure('someScenario')

    assert.equal(failure!.actor, 'admin', 'the actor is still reported')
    assert.equal(failure!.screenshot, undefined, 'just without an image')
    await rm(failureDir, { recursive: true, force: true })
  })

  test('captureFailure on a run with no browser session reports nothing', async () => {
    const { browser } = fakeBrowser()
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
    })

    assert.deepEqual(await provider.captureFailure('someScenario'), [])
  })

  /**
   * The number leading a capture's filename is there so a directory listing
   * reads in the order the run happened. A scenario with two actors is where
   * that claim is testable: counted per session both windows start at 01, and
   * the listing describes an order that never occurred.
   */
  test('actors in one scenario share a single capture sequence', async () => {
    const { browser } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-captures-'))
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: {
        admin: { email: 'admin@test' },
        shopper: { email: 'shopper@test' },
      },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      capture: { dir, runId: 'run-1' },
    })

    provider.beginScenario('Checkout › two people')
    await (await provider.sessionFor('admin')).screenshot('opens the order')
    await (await provider.sessionFor('shopper')).screenshot('sees it arrive')
    await (await provider.sessionFor('admin')).screenshot('marks it shipped')

    assert.deepEqual(
      readdirSync(join(dir, 'run-1', 'checkout-two-people')).sort(),
      [
        '01-opens-the-order-admin.png',
        '02-sees-it-arrive-shopper.png',
        '03-marks-it-shipped-admin.png',
      ]
    )
    await rm(dir, { recursive: true, force: true })
  })

  /**
   * The counter is per scenario, not per run: each scenario's folder is read on
   * its own, so a second scenario starting at 03 would be describing captures
   * that are not in it.
   */
  test('the next scenario files under its own name, counting from one', async () => {
    const { browser } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-captures-'))
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: 's',
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      capture: { dir, runId: 'run-1' },
    })

    provider.beginScenario('First')
    await (await provider.sessionFor('admin')).screenshot('one')
    // Without a reset in between, so the session opened by the first scenario
    // is the one that has to follow the new name.
    provider.beginScenario('Second')
    await (await provider.sessionFor('admin')).screenshot('two')

    assert.deepEqual(readdirSync(join(dir, 'run-1', 'first')), [
      '01-one-admin.png',
    ])
    assert.deepEqual(readdirSync(join(dir, 'run-1', 'second')), [
      '01-two-admin.png',
    ])
    await rm(dir, { recursive: true, force: true })
  })
})
