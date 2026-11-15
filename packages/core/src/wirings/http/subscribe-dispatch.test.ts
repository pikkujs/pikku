import { test, describe, beforeEach } from 'node:test'
import * as assert from 'assert'
import type { CorePikkuMiddleware } from '../../middleware/middleware.types.js'
import { ForbiddenError } from '../../errors/errors.js'
import { fetchData, wireHTTP } from './http-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  PikkuMockRequest,
  PikkuMockResponse,
} from '../channel/local/local-channel-runner.test.js'
import { httpRouter } from './routers/http-router.js'
import {
  createEventHubDistributor,
  createLocalDeliveryBackend,
  setEventHubDistributor,
} from '../channel/event-hub/index.js'

class SseRequest extends PikkuMockRequest {
  header() {
    return null
  }
  async data() {
    return { orderId: '7' }
  }
}

class SseResponse extends PikkuMockResponse {
  public headersMap = new Map<string, string | string[]>()
  public frames: unknown[] = []
  public mode: 'stream' | null = null
  public flushed = false
  public onCloseHandler?: () => void
  public jsonBody: unknown
  public heartbeats = 0

  header(name: string, value: string | string[]) {
    this.headersMap.set(name, value)
    return this
  }
  arrayBuffer(data: XMLHttpRequestBodyInit) {
    this.frames.push(data)
    return this
  }
  json(data: unknown) {
    this.jsonBody = data
    return this
  }
  setMode(mode: 'stream') {
    this.mode = mode
  }
  flushHeaders() {
    this.flushed = true
  }
  onClose(handler: () => void) {
    this.onCloseHandler = handler
  }
  heartbeat() {
    this.heartbeats++
  }
  close() {}
}

const sessionWith =
  (scopes: string[]): CorePikkuMiddleware =>
  async (_services, wire, next) => {
    await wire.setSession?.({ userId: 'u1', scopes } as any)
    await next()
  }

const logger = { info() {}, warn() {}, error() {}, debug() {} }

let routeCounter = 0

describe('a subscribe function wired as an SSE route', () => {
  let distributor: ReturnType<typeof createEventHubDistributor>
  let route = ''

  const wire = ({
    scopes = ['orders:read'],
    sessionScopes = ['orders:read'],
    permissions,
    auth,
    topic = 'order:7',
    sessionless = auth === false,
    withSession = true,
  }: {
    scopes?: string[]
    sessionScopes?: string[]
    permissions?: Record<string, any>
    auth?: boolean
    topic?: string
    sessionless?: boolean
    withSession?: boolean
  } = {}) => {
    pikkuState(null, 'function', 'meta', {
      orderEvents: {
        pikkuFuncId: 'orderEvents',
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless,
        scopes,
        subscribe: { topicPattern: 'order:${string}' },
      },
    } as any)
    pikkuState(null, 'http', 'meta', {
      get: {
        [route]: {
          pikkuFuncId: 'orderEvents',
          route,
          method: 'get',
          sse: true,
        },
      },
      post: {},
      delete: {},
      patch: {},
      head: {},
      put: {},
      options: {},
    })
    wireHTTP({
      route,
      method: 'get',
      sse: true,
      auth,
      func: {
        func: async () => topic,
        scopes,
        permissions,
        middleware:
          auth === false || !withSession ? [] : [sessionWith(sessionScopes)],
      },
    } as any)
    httpRouter.initialize()
  }

  const open = async () => {
    const response = new SseResponse()
    await fetchData(new SseRequest(route, 'get'), response)
    return response
  }

  beforeEach(() => {
    // The runner caches resolved middleware by wire id, so each test gets its own route.
    route = `/orders/events/${++routeCounter}`
    resetPikkuState()
    httpRouter.reset()
    pikkuState(null, 'package', 'singletonServices', {
      logger,
    } as any)
    pikkuState(null, 'package', 'factories', {
      createWireServices: async () => ({}),
    } as any)
    distributor = createEventHubDistributor({
      topics: () => ['order:${string}'],
    })
    distributor.registerDelivery(createLocalDeliveryBackend())
    setEventHubDistributor(distributor)
  })

  test('subscribes the stream to the topic the function returns', async () => {
    wire()
    const response = await open()
    assert.strictEqual(response._status, 200)
    assert.strictEqual(response.mode, 'stream')
    assert.strictEqual(response.flushed, true)
    assert.strictEqual(distributor.subscriptionCount(), 1)
    const [sub] = distributor.subscriptions()
    assert.strictEqual(sub.topic, 'order:7')
    assert.strictEqual(sub.pikkuFuncId, 'orderEvents')
    assert.strictEqual(sub.wireType, 'http')
    assert.deepStrictEqual(sub.input, { orderId: '7' })
    assert.strictEqual((sub.session as any).userId, 'u1')

    await distributor.publish('order:7', { paid: true })
    assert.deepStrictEqual(response.frames, ['{"paid":true}'])
    assert.ok(
      !JSON.stringify(response.frames).includes('order:7'),
      'the topic is never echoed to the client'
    )
  })

  test('is refused without the scope: 403, not a 200 stream', async () => {
    wire({ sessionScopes: [] })
    const response = await open()
    assert.strictEqual(response._status, 403)
    assert.strictEqual(response.mode, null)
    assert.strictEqual(response.flushed, false)
    assert.strictEqual(distributor.subscriptionCount(), 0)
  })

  test('is refused when a permission throws', async () => {
    wire({
      permissions: {
        owner: async () => {
          throw new ForbiddenError('not your order')
        },
      },
    })
    const response = await open()
    assert.strictEqual(response._status, 403)
    assert.strictEqual(response.mode, null)
    assert.strictEqual(distributor.subscriptionCount(), 0)
  })

  test('is refused when a permission returns false', async () => {
    wire({ permissions: { owner: async () => false } })
    const response = await open()
    assert.strictEqual(response._status, 403)
    assert.strictEqual(distributor.subscriptionCount(), 0)
  })

  test('is refused without a session: 401', async () => {
    wire({ withSession: false })
    const response = await open()
    assert.strictEqual(response._status, 401)
    assert.strictEqual(response.mode, null)
    assert.strictEqual(distributor.subscriptionCount(), 0)
  })

  test('wired auth: false it subscribes without a session', async () => {
    wire({ auth: false, scopes: [] })
    const response = await open()
    assert.strictEqual(response._status, 200)
    assert.strictEqual(response.mode, 'stream')
    assert.strictEqual(distributor.subscriptionCount(), 1)
  })

  test('a topic no subscribe function declares is refused before the stream opens', async () => {
    wire({ topic: 'invoice:7' })
    const response = await open()
    assert.strictEqual(response._status, 500)
    assert.strictEqual(response.mode, null)
    assert.strictEqual(distributor.subscriptionCount(), 0)
    assert.strictEqual(distributor.isAttached('anything'), false)
  })

  test('closing the stream drops its subscription', async () => {
    wire()
    const response = await open()
    assert.strictEqual(distributor.subscriptionCount(), 1)
    response.onCloseHandler?.()
    assert.strictEqual(distributor.subscriptionCount(), 0)
  })

  describe('the SSE heartbeat', () => {
    const useHeartbeat = (sseHeartbeatMs?: number) => {
      distributor = createEventHubDistributor({
        topics: () => ['order:${string}'],
        sseHeartbeatMs,
      })
      distributor.registerDelivery(createLocalDeliveryBackend())
      setEventHubDistributor(distributor)
    }
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    test('a quiet stream gets comment frames until it closes', async () => {
      useHeartbeat(15)
      wire()
      const response = await open()
      await sleep(80)
      assert.ok(response.heartbeats >= 2, `got ${response.heartbeats}`)
      response.onCloseHandler?.()
      const atClose = response.heartbeats
      await sleep(60)
      assert.strictEqual(response.heartbeats, atClose)
      assert.deepStrictEqual(
        response.frames,
        [],
        'comments are not data frames'
      )
    })

    test('0 turns the heartbeat off', async () => {
      useHeartbeat(0)
      wire()
      const response = await open()
      await sleep(50)
      assert.strictEqual(response.heartbeats, 0)
    })

    test('the default is 5 s, well under a 10 s idle timeout', async () => {
      useHeartbeat()
      assert.strictEqual(distributor.sseHeartbeatMs, 5000)
    })
  })
})
