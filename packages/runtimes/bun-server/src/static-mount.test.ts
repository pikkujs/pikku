import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setSingletonServices } from '@pikku/core'
import { resetPikkuState } from '@pikku/core/internal'
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
    const response = await fetch(`${origin}/console/tests/userflows?id=x`)
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
