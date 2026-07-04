import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/internal'

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
    const response = await fetch(`${origin}/console/tests/userflows?id=x`, {
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
