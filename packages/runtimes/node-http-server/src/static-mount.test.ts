import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { httpRouter, wireHTTP } from '@pikku/core/http'
import { addFunction } from '@pikku/core/function'

import { PikkuNodeHTTPServer } from './pikku-node-http-server.js'

const createMockLogger = () => ({
  info: (_msg: string) => {},
  warn: (_msg: string) => {},
  error: (_msg: string | Error) => {},
  debug: (_msg: string) => {},
  setLevel: () => {},
})

describe('PikkuNodeHTTPServer static mounts', { concurrency: false }, () => {
  let tmpDir: string
  let server: PikkuNodeHTTPServer | undefined
  let origin: string

  beforeEach(async () => {
    resetPikkuState()
    tmpDir = await mkdtemp(join(tmpdir(), 'pikku-static-mount-'))
    pikkuState(null, 'package', 'singletonServices', {
      logger: createMockLogger(),
      schema: {
        compileSchema: async () => {},
        getSchemaNames: () => new Set<string>(),
      },
    } as any)

    await writeFile(
      join(tmpDir, 'index.html'),
      '<!doctype html><title>console</title>'
    )
    await mkdir(join(tmpDir, 'assets'))
    await writeFile(join(tmpDir, 'assets', 'app.js'), 'console.log("app")')

    server = new PikkuNodeHTTPServer(
      {
        hostname: '127.0.0.1',
        port: 0,
        staticMounts: [
          { urlPrefix: '/console', directory: tmpDir, spaFallback: true },
        ],
      } as any,
      createMockLogger() as any
    )
    await server.init()
    await server.start()
    const address = server.server.address()
    assert.ok(address && typeof address === 'object')
    origin = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    if (server) {
      await server.stop()
      server = undefined
    }
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('serves files under the prefix with a content type', async () => {
    const response = await fetch(`${origin}/console/assets/app.js`, {
      headers: { connection: 'close' },
    })
    assert.equal(response.status, 200)
    assert.match(
      response.headers.get('content-type') ?? '',
      /application\/javascript/
    )
    assert.equal(await response.text(), 'console.log("app")')
  })

  test('serves index.html at the mount root, with and without trailing slash', async () => {
    for (const path of ['/console', '/console/']) {
      const response = await fetch(`${origin}${path}`, {
        headers: { connection: 'close' },
      })
      assert.equal(response.status, 200)
      assert.match(response.headers.get('content-type') ?? '', /text\/html/)
      assert.match(await response.text(), /<title>console<\/title>/)
    }
  })

  test('SPA fallback serves index.html for unknown paths under the prefix', async () => {
    const response = await fetch(`${origin}/console/scenarios?id=x`, {
      headers: { connection: 'close' },
    })
    assert.equal(response.status, 200)
    assert.match(await response.text(), /<title>console<\/title>/)
  })

  test('does not intercept paths outside the prefix', async () => {
    const response = await fetch(`${origin}/consolerelated`, {
      headers: { connection: 'close' },
    })
    assert.equal(response.status, 404)
    const outside = await fetch(`${origin}/api/things`, {
      headers: { connection: 'close' },
    })
    assert.equal(outside.status, 404)
  })

  test('does not intercept non-GET methods', async () => {
    const response = await fetch(`${origin}/console/assets/app.js`, {
      method: 'POST',
      headers: { connection: 'close' },
    })
    assert.equal(response.status, 404)
  })

  test('blocks path traversal out of the mount directory', async () => {
    await writeFile(join(tmpDir, '..', 'pikku-static-secret.txt'), 'secret')
    try {
      const response = await fetch(
        `${origin}/console/%2e%2e/pikku-static-secret.txt`,
        { headers: { connection: 'close' } }
      )
      assert.notEqual(response.status, 200)
    } finally {
      await rm(join(tmpDir, '..', 'pikku-static-secret.txt'), { force: true })
    }
  })
})

describe('PikkuNodeHTTPServer root-mounted SPA', { concurrency: false }, () => {
  let tmpDir: string
  let server: PikkuNodeHTTPServer | undefined
  let origin: string

  beforeEach(async () => {
    resetPikkuState()
    httpRouter.reset()
    tmpDir = await mkdtemp(join(tmpdir(), 'pikku-spa-mount-'))
    pikkuState(null, 'package', 'singletonServices', {
      logger: createMockLogger(),
      schema: {
        compileSchema: async () => {},
        getSchemaNames: () => new Set<string>(),
      },
    } as any)

    await writeFile(
      join(tmpDir, 'index.html'),
      '<!doctype html><title>app shell</title>'
    )
    await mkdir(join(tmpDir, 'assets'))
    await writeFile(join(tmpDir, 'assets', 'app.js'), 'console.log("app")')

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

    server = new PikkuNodeHTTPServer(
      {
        hostname: '127.0.0.1',
        port: 0,
        staticMounts: [
          { urlPrefix: '/', directory: tmpDir, spaFallback: true },
        ],
      } as any,
      createMockLogger() as any
    )
    await server.init()
    await server.start()
    const address = server.server.address()
    assert.ok(address && typeof address === 'object')
    origin = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    if (server) {
      await server.stop()
      server = undefined
    }
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('a wired API route still dispatches under a root SPA mount', async () => {
    const response = await fetch(`${origin}/api/things`, {
      headers: { connection: 'close' },
    })
    assert.equal(response.status, 200)
    assert.match(
      response.headers.get('content-type') ?? '',
      /application\/json/,
      'API route returned the SPA shell instead of dispatching'
    )
    assert.deepEqual(await response.json(), { things: ['one'] })
  })

  test('static files still win over the SPA fallback', async () => {
    const response = await fetch(`${origin}/assets/app.js`, {
      headers: { connection: 'close' },
    })
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'console.log("app")')
  })

  test('unknown client routes still fall back to the app shell', async () => {
    const response = await fetch(`${origin}/records/42`, {
      headers: { connection: 'close' },
    })
    assert.equal(response.status, 200)
    assert.match(await response.text(), /<title>app shell<\/title>/)
  })
})

describe(
  'PikkuNodeHTTPServer asset-mapped mount',
  { concurrency: false },
  () => {
    let tmpDir: string
    let server: PikkuNodeHTTPServer | undefined
    let origin: string

    beforeEach(async () => {
      resetPikkuState()
      httpRouter.reset()
      tmpDir = await mkdtemp(join(tmpdir(), 'pikku-assets-mount-'))
      pikkuState(null, 'package', 'singletonServices', {
        logger: createMockLogger(),
        schema: {
          compileSchema: async () => {},
          getSchemaNames: () => new Set<string>(),
        },
      } as any)

      // The files live in a `store` subdirectory that the mount's own `directory`
      // does not contain, so a hit can only come from the map.
      const store = join(tmpDir, 'store')
      await mkdir(store)
      await writeFile(
        join(store, 'shell-abc123.html'),
        '<!doctype html><title>embedded shell</title>'
      )
      await writeFile(join(store, 'app-def456.js'), 'console.log("embedded")')

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

      server = new PikkuNodeHTTPServer(
        {
          hostname: '127.0.0.1',
          port: 0,
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
        createMockLogger() as any
      )
      await server.init()
      await server.start()
      const address = server.server.address()
      assert.ok(address && typeof address === 'object')
      origin = `http://127.0.0.1:${address.port}`
    })

    afterEach(async () => {
      if (server) {
        await server.stop()
        server = undefined
      }
      await rm(tmpDir, { recursive: true, force: true })
    })

    test('serves a mapped asset from the path the map names', async () => {
      const response = await fetch(`${origin}/assets/app.js`, {
        headers: { connection: 'close' },
      })
      assert.equal(response.status, 200)
      assert.match(
        response.headers.get('content-type') ?? '',
        /application\/javascript/,
        'content type comes from the request key, not the on-disk hashed name'
      )
      assert.equal(await response.text(), 'console.log("embedded")')
    })

    test('serves the mapped index.html at the mount root', async () => {
      const response = await fetch(`${origin}/`, {
        headers: { connection: 'close' },
      })
      assert.equal(response.status, 200)
      assert.match(await response.text(), /<title>embedded shell<\/title>/)
    })

    test('a wired API route still dispatches under a root asset mount', async () => {
      const response = await fetch(`${origin}/api/things`, {
        headers: { connection: 'close' },
      })
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { things: ['one'] })
    })

    test('an unmapped key falls back to the app shell', async () => {
      const response = await fetch(`${origin}/records/42`, {
        headers: { connection: 'close' },
      })
      assert.equal(response.status, 200)
      assert.match(await response.text(), /<title>embedded shell<\/title>/)
    })

    test('a traversal-shaped key is a plain miss, not a rejection', async () => {
      // A map lookup cannot escape a directory, so there is nothing to reject:
      // the key is simply absent and the SPA fallback is allowed to answer.
      const response = await fetch(`${origin}/%2e%2e/pikku-assets-secret.txt`, {
        headers: { connection: 'close' },
      })
      assert.equal(response.status, 200)
      assert.match(await response.text(), /<title>embedded shell<\/title>/)
    })
  }
)
