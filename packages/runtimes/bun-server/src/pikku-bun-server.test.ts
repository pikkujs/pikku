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

describe('PikkuBunServer idleTimeout', () => {
  // Capture what is handed to Bun.serve, then delegate to the real thing.
  const serveOptions = async (idleTimeout?: number) => {
    const real = Bun.serve
    let seen: Record<string, unknown> = {}
    ;(Bun as any).serve = (opts: Record<string, unknown>) => {
      seen = opts
      return (real as any)(opts)
    }
    const s = new PikkuBunServer(
      { port: 0, hostname: 'localhost', idleTimeout },
      noopLogger
    )
    try {
      await s.start()
    } finally {
      ;(Bun as any).serve = real
      await s.stop()
    }
    return seen
  }

  test('passes a configured idleTimeout to Bun.serve', async () => {
    assert.equal((await serveOptions(60)).idleTimeout, 60)
  })

  test('omits idleTimeout when unset so Bun keeps its default', async () => {
    assert.equal('idleTimeout' in (await serveOptions()), false)
  })
})
