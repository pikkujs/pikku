import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
// Type-only, so it is erased before runtime and does not load the module ahead
// of the `cloudflare:workers` stub registered below.
import type { createCloudflareWebSocketHandler as CreateWsHandler } from './handler-factories.js'

class WorkerEntrypointStub {
  constructor(
    readonly ctx: unknown,
    readonly env: unknown
  ) {}
}

// `cloudflare:workers` only exists inside the workerd runtime. See the same
// stub in handler-factories.test.ts. This suite lives in its own file because
// `setupServices` caches the booted services at module scope, and the boot
// failure below can only be observed on a cache that nothing has filled yet —
// run-tests.sh gives every file its own worker process.
if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
  const { mock } = await import('bun:test')
  mock.module('cloudflare:workers', () => ({
    WorkerEntrypoint: WorkerEntrypointStub,
  }))
} else {
  const { registerHooks } = await import('node:module')
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'cloudflare:workers') {
        return {
          url: 'data:text/javascript,export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env } }',
          shortCircuit: true,
        }
      }
      return nextResolve(specifier, context)
    },
  })
}

let createCloudflareWebSocketHandler: typeof CreateWsHandler

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

const okFactories = {
  createConfig: async () => ({}),
  createSingletonServices: async () => ({ logger }) as any,
}

const throwingFactories = {
  createConfig: async () => ({}),
  createSingletonServices: async () => {
    throw new Error('DATABASE_URL not set')
  },
}

const durableObjectReturning = (response: Response) => ({
  idFromName: () => ({ toString: () => 'default' }),
  get: () => ({ fetch: async () => response }),
})

const durableObjectThrowing = (error: Error) => ({
  idFromName: () => ({ toString: () => 'default' }),
  get: () => ({
    fetch: async () => {
      throw error
    },
  }),
})

const upgrade = (env: Record<string, unknown>, factories: any) => {
  const Handler = createCloudflareWebSocketHandler(factories)
  const handler = new Handler({} as any, env as any)
  return handler.fetch(
    new Request('https://unit.example.com/cli', {
      headers: { upgrade: 'websocket' },
    })
  )
}

describe('cloudflare channel handler', () => {
  before(async () => {
    ;({ createCloudflareWebSocketHandler } =
      await import('./handler-factories.js'))
  })

  // Declared first on purpose: once any test boots successfully the module's
  // service cache is warm and `createSingletonServices` is never called again.
  test('reports a singleton-services boot failure instead of throwing', async () => {
    const response = await upgrade(
      {
        WEBSOCKET_HIBERNATION_SERVER: durableObjectReturning(
          new Response(null, { status: 101 })
        ),
      },
      throwingFactories
    )
    assert.equal(response.status, 503)
    const raw = await response.text()
    const body = JSON.parse(raw) as Record<string, unknown>
    assert.equal(body.ok, false)
    assert.equal(body.stage, 'singleton-services')
    assert.equal(body.error, 'Channel unavailable')
    // The route is unauthenticated and a boot failure is usually a service
    // refusing to connect, so the reason — which routinely carries the
    // connection string that failed — must not be in the reply.
    assert.equal(raw.includes('DATABASE_URL'), false)
    assert.equal('message' in body, false)
    assert.equal('stack' in body, false)
    assert.equal('errorName' in body, false)
  })

  test('reports a missing durable object binding', async () => {
    const response = await upgrade({}, okFactories)
    assert.equal(response.status, 503)
    assert.match(await response.text(), /WEBSOCKET_HIBERNATION_SERVER/)
  })

  test('reports a durable object that throws on dispatch', async () => {
    const response = await upgrade(
      {
        WEBSOCKET_HIBERNATION_SERVER: durableObjectThrowing(
          new Error('Durable Object class not found')
        ),
      },
      okFactories
    )
    assert.equal(response.status, 503)
    const raw = await response.text()
    const body = JSON.parse(raw) as Record<string, unknown>
    assert.equal(body.stage, 'durable-object')
    assert.equal(body.error, 'Channel unavailable')
    assert.equal(raw.includes('Durable Object class not found'), false)
  })

  // The durable object's own boot failure arrives here as a throw on dispatch,
  // so it reports under the same stage. Which of the two it was is a question
  // for the log — the reply says only that the channel is unavailable.
  test('keeps a boot failure inside the durable object out of the reply', async () => {
    const inner = new Error(
      'channel singleton services failed to boot: no kysely'
    )
    inner.name = 'PikkuChannelServicesError'
    const response = await upgrade(
      { WEBSOCKET_HIBERNATION_SERVER: durableObjectThrowing(inner) },
      okFactories
    )
    const raw = await response.text()
    const body = JSON.parse(raw) as Record<string, unknown>
    assert.equal(body.stage, 'durable-object')
    assert.equal(body.error, 'Channel unavailable')
    assert.equal(raw.includes('PikkuChannelServicesError'), false)
    assert.equal(raw.includes('no kysely'), false)
  })

  test('passes a successful handshake through untouched', async () => {
    const handshake = new Response(null, { status: 101 })
    const response = await upgrade(
      { WEBSOCKET_HIBERNATION_SERVER: durableObjectReturning(handshake) },
      okFactories
    )
    assert.equal(response, handshake)
  })
})
