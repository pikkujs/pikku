import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setSingletonServices, resetPikkuState } from '@pikku/core/state'
import type { Logger } from '@pikku/core/services'

import { PikkuExpressServer } from './pikku-express-server.js'

const PORT = 47921

const noopLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
  setLevel: () => {},
} as unknown as Logger

describe('PikkuExpressServer body size limit', () => {
  let server: PikkuExpressServer

  before(async () => {
    setSingletonServices({
      logger: noopLogger,
      schema: {
        compileSchema: () => {},
        getSchemaNames: () => new Set<string>(),
      },
    } as any)
    server = new PikkuExpressServer(
      { port: PORT, hostname: 'localhost' },
      noopLogger
    )
    await server.init({ maxBodySize: 256 })
    await server.start()
  })

  after(async () => {
    await server.stop()
    resetPikkuState()
  })

  test('the JSON parser rejects a body over maxBodySize with a 413', async () => {
    const response = await global.fetch(`http://localhost:${PORT}/anything`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(4096) }),
    })
    assert.equal(response.status, 413)
  })

  test('a body under maxBodySize is not rejected as too large', async () => {
    const response = await global.fetch(`http://localhost:${PORT}/anything`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    })
    assert.notEqual(response.status, 413)
  })
})

describe('PikkuExpressServer content signature gate', () => {
  const CONTENT_PORT = 47922
  let server: PikkuExpressServer
  let tmpDir: string

  before(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pikku-express-content-'))
    writeFileSync(join(tmpDir, 'existing.txt'), 'secret asset')
    setSingletonServices({
      logger: noopLogger,
      schema: {
        compileSchema: () => {},
        getSchemaNames: () => new Set<string>(),
      },
      // No jwt: a signed request cannot be verified and must be refused, never
      // trusted. That is the property the gate has to hold.
    } as any)
    server = new PikkuExpressServer(
      {
        port: CONTENT_PORT,
        hostname: 'localhost',
        content: {
          localFileUploadPath: tmpDir,
          uploadUrlPrefix: '/reaper',
          assetUrlPrefix: '/assets',
        },
      } as any,
      noopLogger
    )
    server.enableStaticAssets()
    server.enableReaper()
    await server.init()
    await server.start()
  })

  after(async () => {
    await server.stop()
    resetPikkuState()
  })

  test('refuses an unsigned PUT to the reaper upload path', async () => {
    const response = await global.fetch(
      `http://localhost:${CONTENT_PORT}/reaper/uploads/evil.txt`,
      { method: 'PUT', body: 'attacker-controlled' }
    )
    assert.equal(response.status, 403)
  })

  test('refuses an unsigned GET of a static asset', async () => {
    const response = await global.fetch(
      `http://localhost:${CONTENT_PORT}/assets/existing.txt`
    )
    assert.equal(response.status, 403)
    assert.notEqual(await response.text(), 'secret asset')
  })
})
