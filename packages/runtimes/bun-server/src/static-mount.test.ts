import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setSingletonServices } from '@pikku/core/state'
import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { httpRouter, wireHTTP } from '@pikku/core/http'
import { addFunction } from '@pikku/core/function'
import type { Logger } from '@pikku/core/services'
import { PikkuBunServer } from './pikku-bun-server.js'

const noopLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
  setLevel: () => {},
} as unknown as Logger

describe('PikkuBunServer static mounts', () => {
  let server: PikkuBunServer
  let tmpDir: string
  let origin: string

  before(async () => {
    resetPikkuState()
    setSingletonServices({
      logger: noopLogger,
      schema: {
        compileSchema: () => {},
        getSchemaNames: () => new Set<string>(),
      },
    } as any)
    tmpDir = mkdtempSync(join(tmpdir(), 'pikku-bun-static-'))
    writeFileSync(
      join(tmpDir, 'index.html'),
      '<!doctype html><title>console</title>'
    )
    mkdirSync(join(tmpDir, 'assets'))
    writeFileSync(join(tmpDir, 'assets', 'app.js'), 'console.log("app")')

    server = new PikkuBunServer(
      {
        port: 0,
        hostname: '127.0.0.1',
        staticMounts: [
          { urlPrefix: '/console', directory: tmpDir, spaFallback: true },
        ],
      } as any,
      noopLogger
    )
    await server.init()
    await server.start()
    origin = `http://127.0.0.1:${server.port}`
  })

  after(async () => {
    await server.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('serves files under the prefix with a content type', async () => {
    const response = await fetch(`${origin}/console/assets/app.js`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /javascript/)
    assert.equal(await response.text(), 'console.log("app")')
  })

  test('serves index.html at the mount root, with and without trailing slash', async () => {
    for (const path of ['/console', '/console/']) {
      const response = await fetch(`${origin}${path}`)
      assert.equal(response.status, 200)
      assert.match(await response.text(), /<title>console<\/title>/)
    }
  })

  test('SPA fallback serves index.html for unknown paths under the prefix', async () => {
    const response = await fetch(`${origin}/console/scenarios?id=x`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /<title>console<\/title>/)
  })

  test('does not intercept paths outside the prefix', async () => {
    const response = await fetch(`${origin}/consolerelated`)
    assert.equal(response.status, 404)
  })

  test('does not intercept non-GET methods', async () => {
    const response = await fetch(`${origin}/console/assets/app.js`, {
      method: 'POST',
    })
    assert.equal(response.status, 404)
  })

  test('blocks path traversal out of the mount directory', async () => {
    writeFileSync(join(tmpDir, '..', 'pikku-bun-static-secret.txt'), 'secret')
    try {
      const response = await fetch(
        `${origin}/console/%2e%2e/pikku-bun-static-secret.txt`
      )
      assert.notEqual(response.status, 200)
    } finally {
      rmSync(join(tmpDir, '..', 'pikku-bun-static-secret.txt'), {
        force: true,
      })
    }
  })
})

describe('PikkuBunServer root-mounted SPA', () => {
  let server: PikkuBunServer
  let tmpDir: string
  let origin: string

  before(async () => {
    resetPikkuState()
    httpRouter.reset()
    setSingletonServices({
      logger: noopLogger,
      schema: {
        compileSchema: () => {},
        getSchemaNames: () => new Set<string>(),
      },
    } as any)
    tmpDir = mkdtempSync(join(tmpdir(), 'pikku-bun-spa-'))
    writeFileSync(
      join(tmpDir, 'index.html'),
      '<!doctype html><title>app shell</title>'
    )
    mkdirSync(join(tmpDir, 'assets'))
    writeFileSync(join(tmpDir, 'assets', 'app.js'), 'console.log("app")')

    pikkuState(null, 'function', 'meta', {
      things_func: {
        pikkuFuncId: 'things_func',
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless: true,
      },
    } as any)
    pikkuState(null, 'http', 'meta', {
      get: {
        '/api/things': {
          pikkuFuncId: 'things_func',
          route: '/api/things',
          method: 'get',
        },
      },
      post: {},
      delete: {},
      patch: {},
      head: {},
      put: {},
      options: {},
    } as any)
    addFunction('things_func', { func: async () => ({ things: ['one'] }) })
    wireHTTP({
      route: '/api/things',
      method: 'get',
      auth: false,
      func: { func: async () => ({ things: ['one'] }) },
    } as any)
    httpRouter.initialize()

    server = new PikkuBunServer(
      {
        port: 0,
        hostname: '127.0.0.1',
        staticMounts: [
          { urlPrefix: '/', directory: tmpDir, spaFallback: true },
        ],
      } as any,
      noopLogger
    )
    await server.init()
    await server.start()
    origin = `http://127.0.0.1:${server.port}`
  })

  after(async () => {
    await server.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('a wired API route still dispatches under a root SPA mount', async () => {
    const response = await fetch(`${origin}/api/things`)
    assert.equal(response.status, 200)
    assert.match(
      response.headers.get('content-type') ?? '',
      /application\/json/,
      'API route returned the SPA shell instead of dispatching'
    )
    assert.deepEqual(await response.json(), { things: ['one'] })
  })

  test('static files still win over the SPA fallback', async () => {
    const response = await fetch(`${origin}/assets/app.js`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'console.log("app")')
  })

  test('unknown client routes still fall back to the app shell', async () => {
    const response = await fetch(`${origin}/records/42`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /<title>app shell<\/title>/)
  })
})

describe('PikkuBunServer asset-mapped mount', () => {
  let server: PikkuBunServer
  let tmpDir: string
  let origin: string

  before(async () => {
    resetPikkuState()
    httpRouter.reset()
    setSingletonServices({
      logger: noopLogger,
      schema: {
        compileSchema: () => {},
        getSchemaNames: () => new Set<string>(),
      },
    } as any)
    tmpDir = mkdtempSync(join(tmpdir(), 'pikku-bun-assets-'))

    // The files live in a `store` subdirectory that the mount's own `directory`
    // does not contain, so a hit can only come from the map.
    const store = join(tmpDir, 'store')
    mkdirSync(store)
    writeFileSync(
      join(store, 'shell-abc123.html'),
      '<!doctype html><title>embedded shell</title>'
    )
    writeFileSync(join(store, 'app-def456.js'), 'console.log("embedded")')

    pikkuState(null, 'function', 'meta', {
      things_func: {
        pikkuFuncId: 'things_func',
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless: true,
      },
    } as any)
    pikkuState(null, 'http', 'meta', {
      get: {
        '/api/things': {
          pikkuFuncId: 'things_func',
          route: '/api/things',
          method: 'get',
        },
      },
      post: {},
      delete: {},
      patch: {},
      head: {},
      put: {},
      options: {},
    } as any)
    addFunction('things_func', { func: async () => ({ things: ['one'] }) })
    wireHTTP({
      route: '/api/things',
      method: 'get',
      auth: false,
      func: { func: async () => ({ things: ['one'] }) },
    } as any)
    httpRouter.initialize()

    server = new PikkuBunServer(
      {
        port: 0,
        hostname: '127.0.0.1',
        staticMounts: [
          {
            urlPrefix: '/',
            directory: join(tmpDir, 'nonexistent'),
            spaFallback: true,
            assets: {
              'index.html': join(store, 'shell-abc123.html'),
              'assets/app.js': join(store, 'app-def456.js'),
            },
          },
        ],
      } as any,
      noopLogger
    )
    await server.init()
    await server.start()
    origin = `http://127.0.0.1:${server.port}`
  })

  after(async () => {
    await server.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('serves a mapped asset from the path the map names', async () => {
    const response = await fetch(`${origin}/assets/app.js`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /javascript/)
    assert.equal(await response.text(), 'console.log("embedded")')
  })

  test('serves the mapped index.html at the mount root', async () => {
    const response = await fetch(`${origin}/`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /<title>embedded shell<\/title>/)
  })

  test('a wired API route still dispatches under a root asset mount', async () => {
    const response = await fetch(`${origin}/api/things`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { things: ['one'] })
  })

  test('an unmapped key falls back to the app shell', async () => {
    const response = await fetch(`${origin}/records/42`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /<title>embedded shell<\/title>/)
  })

  test('a traversal-shaped key is a plain miss, not a rejection', async () => {
    // A map lookup cannot escape a directory, so there is nothing to reject:
    // the key is simply absent and the SPA fallback is allowed to answer.
    const response = await fetch(`${origin}/%2e%2e/pikku-bun-assets-secret.txt`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /<title>embedded shell<\/title>/)
  })
})
