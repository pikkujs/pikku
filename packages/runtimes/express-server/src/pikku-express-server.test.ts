import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { setSingletonServices, resetPikkuState } from '@pikku/core/ecosystem'
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
