import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setSingletonServices } from '@pikku/core'
import { resetPikkuState } from '@pikku/core/internal'
import type { Logger } from '@pikku/core/services'
import { PikkuBunServer } from './pikku-bun-server.js'

const PORT = 47817
const HEALTH = '/__health'

const noopLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
  setLevel: () => {},
} as unknown as Logger

describe('PikkuBunServer', () => {
  let server: PikkuBunServer

  before(async () => {
    setSingletonServices({
      logger: noopLogger,
      schema: {
        compileSchema: () => {},
        getSchemaNames: () => new Set<string>(),
      },
    } as any)
    server = new PikkuBunServer(
      { port: PORT, hostname: 'localhost', healthCheckPath: HEALTH },
      noopLogger
    )
    await server.init()
    await server.start()
  })

  after(async () => {
    await server.stop()
    resetPikkuState()
  })

  test('serves the configured health-check path', async () => {
    const res = await fetch(`http://localhost:${PORT}${HEALTH}`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/json')
    assert.deepEqual(await res.json(), { ok: true })
  })

  test('returns 404 for unregistered routes', async () => {
    const res = await fetch(`http://localhost:${PORT}/nothing/here`)
    assert.equal(res.status, 404)
  })

  test('stop() is idempotent', async () => {
    const extra = new PikkuBunServer({ port: PORT + 1 }, noopLogger)
    await extra.start()
    await extra.stop()
    await assert.doesNotReject(extra.stop())
  })
})
