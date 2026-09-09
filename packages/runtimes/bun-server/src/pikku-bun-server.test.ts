import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setSingletonServices } from '@pikku/core/state'
import { resetPikkuState } from '@pikku/core/state'
import type { Logger } from '@pikku/core/services'
import { PikkuBunServer } from './pikku-bun-server.js'

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
  let origin: string

  before(async () => {
    setSingletonServices({
      logger: noopLogger,
      schema: {
        compileSchema: () => {},
        getSchemaNames: () => new Set<string>(),
      },
    } as any)
    server = new PikkuBunServer(
      { port: 0, hostname: 'localhost', healthCheckPath: HEALTH },
      noopLogger
    )
    await server.init()
    await server.start()
    origin = `http://localhost:${server.port}`
  })

  after(async () => {
    await server.stop()
    resetPikkuState()
  })

  test('serves the configured health-check path', async () => {
    const res = await fetch(`${origin}${HEALTH}`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/json')
    assert.deepEqual(await res.json(), { ok: true })
  })

  test('returns 404 for unregistered routes', async () => {
    const res = await fetch(`${origin}/nothing/here`)
    assert.equal(res.status, 404)
  })

  test('stop() is idempotent', async () => {
    const extra = new PikkuBunServer({ port: 0 }, noopLogger)
    await extra.start()
    await extra.stop()
    await assert.doesNotReject(extra.stop())
  })
})
