import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import { deriveActorSecret } from '@pikku/core/persona'

import { PlaywrightScenarioBrowserProvider } from './provider.js'
import { hasFfmpeg } from './capture.js'
import type { BrowserConfig } from './config.js'

/** Long enough to be key material, which every derived credential needs. */
const ROOT = 'a-root-secret-long-enough-to-derive'

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
  const contexts: Array<{
    pages: number
    closed: boolean
    recordVideoDir?: string
  }> = []
  const screenshots: Array<string | undefined> = []
  const videos: Array<{ savedTo?: string; deleted: boolean }> = []
  return {
    contexts,
    screenshots,
    videos,
    browser: {
      newContext: async (options?: { recordVideo?: { dir: string } }) => {
        const context = {
          pages: 0,
          closed: false,
          recordVideoDir: options?.recordVideo?.dir,
        }
        contexts.push(context)
        // Playwright hands a page a Video only when the context records one.
        const video = context.recordVideoDir
          ? (() => {
              const entry: { savedTo?: string; deleted: boolean } = {
                deleted: false,
              }
              videos.push(entry)
              return {
                saveAs: async (path: string) => {
                  entry.savedTo = path
                },
                delete: async () => {
                  entry.deleted = true
                },
                path: async () => join(context.recordVideoDir!, 'raw.webm'),
              }
            })()
          : undefined
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
              video: () => video,
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
      secret: ROOT,
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
      secret: ROOT,
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
      secret: ROOT,
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

  test('an actor browses the app their persona signs into', async () => {
    const { browser } = fakeBrowser()
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config({
        appUrls: {
          workshop: 'https://app.test',
          storefront: 'https://app.test/_frontend/storefront',
        },
      }),
      secret: ROOT,
      actors: {
        mechanic: { email: 'mechanic@test', app: 'workshop' },
        customer: { email: 'customer@test', app: 'storefront' },
      },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
    } as any)

    const mechanic = await provider.sessionFor('mechanic')
    const customer = await provider.sessionFor('customer')

    assert.equal(mechanic.url('/jobs'), 'https://app.test/jobs')
    assert.equal(
      customer.url('/jobs'),
      'https://app.test/_frontend/storefront/jobs',
      'the same path is a different page in each app'
    )
  })

  test('a persona naming no app browses the single appUrl', async () => {
    const { browser } = fakeBrowser()
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config({
        appUrls: { storefront: 'https://app.test/_frontend/storefront' },
      }),
      secret: ROOT,
      actors: { shopper: { email: 'shopper@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
    } as any)

    const shopper = await provider.sessionFor('shopper')

    assert.equal(shopper.url('/jobs'), 'https://app.test/jobs')
  })

  test('an unregistered actor is a clear error, not a silent anonymous window', async () => {
    const { browser } = fakeBrowser()
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
      actors: { shopper: { email: 'shopper@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
    })

    await assert.rejects(
      provider.sessionFor('ghost'),
      /browser actor 'ghost' has no persona/
    )
  })

  test('the browser signs in with that actor own derived credential', async () => {
    const { browser } = fakeBrowser()
    const signIns: Array<{ email: string; name: string; secret: string }> = []
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
      actors: { shopper: { email: 'shopper@test', name: 'Shopper' } },
      connectBrowser: async () => ({ browser }),
      signIn: async (_context, request) => {
        signIns.push(request)
      },
    })

    await provider.sessionFor('shopper')
    await provider.sessionFor('shopper')

    assert.deepEqual(signIns, [
      {
        email: 'shopper@test',
        name: 'Shopper',
        secret: await deriveActorSecret(ROOT, 'shopper@test'),
      },
    ])
    assert.notEqual(signIns[0]!.secret, ROOT, 'the root is never presented')
  })

  test('close releases the browser exactly once and reopens on next use', async () => {
    const { browser } = fakeBrowser()
    let released = 0
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
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
      secret: ROOT,
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
      secret: ROOT,
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
      secret: ROOT,
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
      secret: ROOT,
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

  /**
   * A failure screenshot belongs beside the scenario's other artifacts, not in
   * a tree of its own: "this run's output" has to be one folder, or reviewing a
   * failure means opening two.
   */
  test('captureFailure files a screenshot per actor under the failing scenario', async () => {
    const { browser, screenshots } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-failures-'))
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      capture: { dir, runId: 'run-1' },
    })

    await provider.sessionFor('admin')
    const [failure] = await provider.captureFailure('code editor › edits')

    assert.equal(
      failure!.screenshot,
      join(dir, 'run-1', 'code-editor-edits', 'failure-admin.png'),
      'the label is slugged so it is a usable filename'
    )
    assert.deepEqual(screenshots, [failure!.screenshot])
    await rm(dir, { recursive: true, force: true })
  })

  test('a screenshot that fails never masks the failure being reported', async () => {
    const { browser } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-failures-'))
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      capture: { dir, runId: 'run-1' },
    })

    const admin = await provider.sessionFor('admin')
    admin.page.screenshot = async () => {
      throw new Error('target page, context or browser has been closed')
    }

    const [failure] = await provider.captureFailure('someScenario')

    assert.equal(failure!.actor, 'admin', 'the actor is still reported')
    assert.equal(failure!.screenshot, undefined, 'just without an image')
    await rm(dir, { recursive: true, force: true })
  })

  test('captureFailure on a run with no browser session reports nothing', async () => {
    const { browser } = fakeBrowser()
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
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
      secret: ROOT,
      actors: {
        admin: { email: 'admin@test' },
        shopper: { email: 'shopper@test' },
      },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      capture: { dir, runId: 'run-1', screenshots: true },
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
      secret: ROOT,
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      capture: { dir, runId: 'run-1', screenshots: true },
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

  /**
   * Every run has a capture context now, because video is recorded by default.
   * That must not quietly turn `--screenshots` on: a run that did not ask for
   * images should not be writing them.
   */
  test('a capture context without --screenshots writes no images', async () => {
    const { browser } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-captures-'))
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      capture: { dir, runId: 'run-1', screenshots: false, video: 'failed' },
    })

    provider.beginScenario('First')
    const bytes = await (await provider.sessionFor('admin')).screenshot('one')

    assert.ok(bytes.length > 0, 'the step still gets its bytes')
    assert.equal(
      existsSync(join(dir, 'run-1', 'first')),
      false,
      'and nothing is written'
    )
    await rm(dir, { recursive: true, force: true })
  })
})

describe('PlaywrightScenarioBrowserProvider video retention', () => {
  const providerWith = (
    video: 'off' | 'failed' | 'all',
    dir: string,
    browser: any
  ) =>
    new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      capture: { dir, runId: 'run-1', video, compress: false },
    })

  test('records nothing at all when retention is off', async () => {
    const { browser, contexts, videos } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-video-'))
    const provider = providerWith('off', dir, browser)

    provider.beginScenario('Checkout')
    await provider.sessionFor('admin')

    assert.equal(contexts[0]!.recordVideoDir, undefined)
    assert.deepEqual(videos, [], 'no recording means no video to keep or drop')
    await rm(dir, { recursive: true, force: true })
  })

  /**
   * The expensive half of video is encoding, not recording, so a green run has
   * to reach the end having thrown its footage away — otherwise "keep
   * failures" costs the same as keeping everything.
   */
  test('a scenario that passed has its recording discarded', async () => {
    const { browser, videos } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-video-'))
    const provider = providerWith('failed', dir, browser)

    provider.beginScenario('Checkout › succeeds')
    await provider.sessionFor('admin')
    provider.endScenario('passed')
    await provider.reset()

    assert.equal(
      videos.length,
      1,
      'it was recorded — the outcome was not known'
    )
    assert.equal(videos[0]!.savedTo, undefined, 'and never filed')
    assert.equal(videos[0]!.deleted, true, 'and then dropped')
    await rm(dir, { recursive: true, force: true })
  })

  test('a scenario that failed keeps its recording, filed under scenario and actor', async () => {
    const { browser, videos } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-video-'))
    const provider = providerWith('failed', dir, browser)

    provider.beginScenario('Checkout › breaks')
    await provider.sessionFor('admin')
    provider.endScenario('failed')
    await provider.reset()

    assert.equal(
      videos[0]!.savedTo,
      join(dir, 'run-1', 'checkout-breaks', 'admin.webm'),
      'Playwright names the raw file; retention is what makes it attributable'
    )
    await rm(dir, { recursive: true, force: true })
  })

  test('retention "all" keeps a passing scenario too', async () => {
    const { browser, videos } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-video-'))
    const provider = providerWith('all', dir, browser)

    provider.beginScenario('Checkout › succeeds')
    await provider.sessionFor('admin')
    provider.endScenario('passed')
    await provider.reset()

    assert.equal(
      videos[0]!.savedTo,
      join(dir, 'run-1', 'checkout-succeeds', 'admin.webm')
    )
    await rm(dir, { recursive: true, force: true })
  })

  /**
   * A scenario nobody reported on is the one most worth watching — it did not
   * reach the point where an outcome is recorded.
   */
  test('an unreported scenario is treated as failed', async () => {
    const { browser, videos } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-video-'))
    const provider = providerWith('failed', dir, browser)

    provider.beginScenario('Checkout › vanishes')
    await provider.sessionFor('admin')
    await provider.reset()

    assert.equal(
      videos[0]!.savedTo,
      join(dir, 'run-1', 'checkout-vanishes', 'admin.webm')
    )
    await rm(dir, { recursive: true, force: true })
  })

  test('each scenario files its own recording as the next one resets', async () => {
    const { browser, videos } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-video-'))
    const provider = providerWith('failed', dir, browser)

    provider.beginScenario('First')
    await provider.sessionFor('admin')
    provider.endScenario('failed')
    await provider.reset()

    provider.beginScenario('Second')
    await provider.sessionFor('admin')
    provider.endScenario('passed')
    await provider.reset()

    assert.equal(
      videos[0]!.savedTo,
      join(dir, 'run-1', 'first', 'admin.webm'),
      'the failure is filed under the scenario that produced it'
    )
    assert.equal(
      videos[1]!.savedTo,
      undefined,
      'and the pass that followed is not'
    )
    await rm(dir, { recursive: true, force: true })
  })
})

/**
 * The ledger is what makes a run reviewable later. A directory listing cannot
 * say which window produced an image or what its author was pointing at, so the
 * driver — the only thing that knows — reports it.
 */
describe('PlaywrightScenarioBrowserProvider artifact ledger', () => {
  test('a run with no capture at all files nothing', async () => {
    const { browser } = fakeBrowser()
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
    })

    provider.beginScenario('Checkout')
    await (await provider.sessionFor('admin')).screenshot('opens the order')

    assert.deepEqual(provider.artifacts(), [])
  })

  test('named screenshots are reported with their caption, actor and scenario', async () => {
    const { browser } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-ledger-'))
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
      actors: {
        admin: { email: 'admin@test' },
        shopper: { email: 'shopper@test' },
      },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      capture: { dir, runId: 'run-1', screenshots: true, video: 'off' },
    })

    provider.beginScenario('Checkout › two people')
    await (await provider.sessionFor('admin')).screenshot('opens the order')
    await (await provider.sessionFor('shopper')).screenshot('sees it arrive')

    assert.deepEqual(provider.artifacts(), [
      {
        scenario: 'Checkout › two people',
        kind: 'screenshot',
        path: 'checkout-two-people/01-opens-the-order-admin.png',
        actor: 'admin',
        name: 'opens the order',
      },
      {
        scenario: 'Checkout › two people',
        kind: 'screenshot',
        path: 'checkout-two-people/02-sees-it-arrive-shopper.png',
        actor: 'shopper',
        name: 'sees it arrive',
      },
    ])
    await rm(dir, { recursive: true, force: true })
  })

  test('a failure screenshot is reported as one, so the console can lead with it', async () => {
    const { browser } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-ledger-'))
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      capture: { dir, runId: 'run-1', video: 'off' },
    })

    await provider.sessionFor('admin')
    await provider.captureFailure('code editor › edits')

    assert.deepEqual(provider.artifacts(), [
      {
        scenario: 'code editor › edits',
        kind: 'failure',
        path: 'code-editor-edits/failure-admin.png',
        actor: 'admin',
      },
    ])
    await rm(dir, { recursive: true, force: true })
  })

  test('only the recordings that survived retention are reported', async () => {
    const { browser } = fakeBrowser()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-ledger-'))
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      capture: { dir, runId: 'run-1', video: 'failed', compress: false },
    })

    provider.beginScenario('First')
    await provider.sessionFor('admin')
    provider.endScenario('failed')
    await provider.reset()

    provider.beginScenario('Second')
    await provider.sessionFor('admin')
    provider.endScenario('passed')
    await provider.reset()

    assert.deepEqual(provider.artifacts(), [
      {
        scenario: 'First',
        kind: 'video',
        path: 'first/admin.webm',
        actor: 'admin',
      },
    ])
    await rm(dir, { recursive: true, force: true })
  })

  /**
   * The path in the record has to survive compression. Encoding changes the
   * container, so a ledger left pointing at the `.webm` names a file that the
   * same close() just deleted — and the console renders a broken player.
   */
  test('compressing a kept recording moves the record with it', async (t) => {
    if (!(await hasFfmpeg())) {
      t.skip('ffmpeg is not on PATH')
      return
    }
    const dir = await mkdtemp(join(tmpdir(), 'pikku-ledger-'))
    const source = join(dir, 'source.webm')
    const made = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=1:size=320x240:rate=10',
        '-c:v',
        'libvpx',
        source,
      ],
      { stdio: 'ignore' }
    )
    assert.equal(made.status, 0, 'fixture recording could be produced')

    const { browser } = fakeBrowser()
    // A real file where the provider filed it, so close() has something to
    // encode — the fake browser's saveAs only records the path it was given.
    const provider = new PlaywrightScenarioBrowserProvider({
      config: config(),
      secret: ROOT,
      actors: { admin: { email: 'admin@test' } },
      connectBrowser: async () => ({ browser }),
      signIn: async () => {},
      capture: { dir, runId: 'run-1', video: 'all' },
    })

    provider.beginScenario('Checkout')
    await provider.sessionFor('admin')
    provider.endScenario('failed')
    await provider.reset()

    const filed = join(dir, 'run-1', 'checkout', 'admin.webm')
    mkdirSync(dirname(filed), { recursive: true })
    copyFileSync(source, filed)

    await provider.close()

    assert.deepEqual(
      provider.artifacts().map((artifact) => artifact.path),
      ['checkout/admin.mp4']
    )
    assert.ok(existsSync(join(dir, 'run-1', 'checkout', 'admin.mp4')))
    await rm(dir, { recursive: true, force: true })
  })
})
