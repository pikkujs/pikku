import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { httpRouter, wireHTTP } from '@pikku/core/http'
import { installEventHubDistributor } from '@pikku/core/internal/event-hub'
import { pikkuState, resetPikkuState } from '@pikku/core/state'

import { PikkuNodeHTTPServer } from './pikku-node-http-server.js'

const logger = {
  info: (_msg: unknown) => {},
  warn: (_msg: unknown) => {},
  error: (_msg: unknown) => {},
  debug: (_msg: unknown) => {},
  setLevel: () => {},
}

// The test's own authentication: the scopes come from a header, which is all a
// stand-in for a real session needs to be.
const sessionFromHeader = async (_services: any, wire: any, next: any) => {
  const scopes = String(wire.http?.request?.header?.('x-scopes') ?? '')
  await wire.setSession?.({
    userId: 'u1',
    scopes: scopes ? scopes.split(',') : [],
  })
  await next()
}

const funcMeta = (pikkuFuncId: string, extra: Record<string, unknown>) => ({
  pikkuFuncId,
  inputSchemaName: null,
  outputSchemaName: null,
  sessionless: false,
  ...extra,
})

describe('an SSE subscribe function on a real HTTP server', () => {
  let server: PikkuNodeHTTPServer
  let origin: string

  beforeEach(async () => {
    resetPikkuState()
    httpRouter.reset()
    const { services } = installEventHubDistributor({
      topics: () => ['order:${string}'],
    })
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      schema: {
        compileSchema: async () => {},
        getSchemaNames: () => new Set<string>(),
      },
      ...services,
    } as any)
    pikkuState(null, 'package', 'factories', {
      createWireServices: async () => ({}),
    } as any)

    pikkuState(null, 'function', 'meta', {
      orderEvents: funcMeta('orderEvents', {
        scopes: ['orders:read'],
        subscribe: { topicPattern: 'order:${string}' },
      }),
      shipOrder: funcMeta('shipOrder', { sessionless: true }),
    } as any)
    const emptyMethods = {
      post: {},
      delete: {},
      patch: {},
      head: {},
      put: {},
      options: {},
    }
    pikkuState(null, 'http', 'meta', {
      ...emptyMethods,
      get: {
        '/orders/:orderId/events': {
          pikkuFuncId: 'orderEvents',
          route: '/orders/:orderId/events',
          method: 'get',
          sse: true,
        },
      },
      post: {
        '/orders/:orderId/ship': {
          pikkuFuncId: 'shipOrder',
          route: '/orders/:orderId/ship',
          method: 'post',
        },
      },
    } as any)

    wireHTTP({
      route: '/orders/:orderId/events',
      method: 'get',
      sse: true,
      func: {
        func: async (_services: any, data: { orderId: string }) =>
          `order:${data.orderId}`,
        scopes: ['orders:read'],
        middleware: [sessionFromHeader],
      },
    } as any)
    // A normal function that publishes: it only ever sees the publisher.
    wireHTTP({
      route: '/orders/:orderId/ship',
      method: 'post',
      auth: false,
      func: {
        func: async ({ eventHub }: any, data: { orderId: string }) => {
          await eventHub.publish(`order:${data.orderId}`, {
            orderId: data.orderId,
            status: 'shipped',
          })
          return { ok: true }
        },
      },
    } as any)
    httpRouter.initialize()

    server = new PikkuNodeHTTPServer(
      { hostname: '127.0.0.1', port: 0 } as any,
      logger as any
    )
    await server.init()
    await server.start()
    const address = server.server.address()
    assert.ok(address && typeof address === 'object')
    origin = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    await server.stop()
  })

  const readFrame = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    ms = 3000
  ) => {
    const decoder = new TextDecoder()
    let text = ''
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      const result = await Promise.race([
        reader.read(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 200)),
      ])
      if (result === null) continue
      if (result.done) break
      text += decoder.decode(result.value)
      const match = text.match(/data: (.*)\n\n/)
      if (match) return match[1]
    }
    return undefined
  }

  test('a publish from a function reaches the subscriber, without the topic', async () => {
    const controller = new AbortController()
    const response = await fetch(`${origin}/orders/7/events`, {
      headers: { 'x-scopes': 'orders:read', accept: 'text/event-stream' },
      signal: controller.signal,
    })
    assert.equal(response.status, 200)
    const reader = response.body!.getReader()

    const shipped = await fetch(`${origin}/orders/7/ship`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(shipped.status, 200)

    const frame = await readFrame(reader)
    assert.ok(frame, 'the subscriber received no frame')
    assert.deepEqual(JSON.parse(frame), { orderId: '7', status: 'shipped' })
    assert.ok(
      !frame.includes('order:7'),
      'the topic is never sent to the client'
    )
    controller.abort()
  })

  test('a request without the scope gets 403 and receives nothing', async () => {
    const denied = await fetch(`${origin}/orders/7/events`, {
      headers: { accept: 'text/event-stream' },
    })
    assert.equal(denied.status, 403)
    assert.notEqual(denied.headers.get('content-type'), 'text/event-stream')

    const shipped = await fetch(`${origin}/orders/7/ship`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(shipped.status, 200)
    const body = await denied.text()
    assert.ok(
      !body.includes('shipped'),
      'a refused request was delivered an event'
    )
  })

  test('a subscriber to one order does not receive another order', async () => {
    const controller = new AbortController()
    const response = await fetch(`${origin}/orders/7/events`, {
      headers: { 'x-scopes': 'orders:read' },
      signal: controller.signal,
    })
    const reader = response.body!.getReader()
    await fetch(`${origin}/orders/8/ship`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(await readFrame(reader, 800), undefined)
    controller.abort()
  })
})
