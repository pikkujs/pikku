import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  openPageSession,
  screenshotName,
  screenshotPages,
} from './page-screenshots.js'
import type { BrowserConfig } from './config.js'

const config = {
  appUrl: 'http://placeholder',
  apiUrl: 'http://placeholder/api',
  timeout: 1_000,
  headed: false,
  slowMo: 0,
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 800 },
} as BrowserConfig

const fakeBrowser = (visited: string[], released: string[]) => ({
  browser: {
    newContext: async () => ({
      addInitScript: async () => {},
      close: async () => {
        released.push('context')
      },
      newPage: async () => ({
        setDefaultTimeout: () => {},
        on: () => {},
        goto: async (url: string) => {
          visited.push(url)
          if (url.endsWith('/broken')) throw new Error('net::ERR_FAILED')
          return { status: () => (url.endsWith('/missing') ? 404 : 200) }
        },
        waitForSelector: async () => {},
        screenshot: async () => new Uint8Array([1, 2]),
      }),
    }),
  } as any,
  release: async () => {
    released.push('browser')
  },
})

describe('screenshotPages', () => {
  test('photographs each path against the base url and keeps going past a failure', async () => {
    const visited: string[] = []
    const released: string[] = []
    const { session, close } = await openPageSession('http://localhost:7104', {
      config,
      connectBrowser: async () => fakeBrowser(visited, released),
    })
    const shots = await screenshotPages({
      session,
      paths: ['/', '/broken', '/missing'],
    })
    await close()

    assert.deepEqual(visited, [
      'http://localhost:7104/',
      'http://localhost:7104/broken',
      'http://localhost:7104/missing',
    ])
    assert.deepEqual(
      shots.map(({ path, httpStatus, png, error }) => [
        path,
        httpStatus,
        png?.length ?? null,
        error ?? null,
      ]),
      [
        ['/', 200, 2, null],
        ['/broken', null, null, 'net::ERR_FAILED'],
        ['/missing', 404, 2, null],
      ]
    )
    assert.deepEqual(released, ['context', 'browser'])
  })

  test('names a file after its path', () => {
    assert.equal(screenshotName('/'), 'index.png')
    assert.equal(screenshotName('/app/issues'), 'app_issues.png')
    assert.equal(screenshotName('/en/posts/7/'), 'en_posts_7.png')
  })
})
