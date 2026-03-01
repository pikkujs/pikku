import { test, describe, beforeEach } from 'node:test'
import * as assert from 'assert'
import { wireGateway, createListenerMessageHandler } from './gateway-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { httpRouter } from '../http/routers/http-router.js'
import { fetch } from '../http/http-runner.js'
import type {
  GatewayAdapter,
  GatewayInboundMessage,
  GatewayOutboundMessage,
} from './gateway.types.js'
import type { CorePikkuMiddleware } from '../../types/core.types.js'

// --- Mock adapter ----------------------------------------------------------

const createMockAdapter = (
  opts: {
    name?: string
    parseResult?: GatewayInboundMessage | null
    verifyResult?: { verified: true; response: unknown } | { verified: false }
  } = {}
): GatewayAdapter & {
  sentMessages: Array<{ senderId: string; message: GatewayOutboundMessage }>
  simulateMessage: (data: unknown) => Promise<void>
} => {
  const sentMessages: Array<{
    senderId: string
    message: GatewayOutboundMessage
  }> = []

  let onMessage: ((data: unknown) => Promise<void>) | undefined

  return {
    name: opts.name ?? 'mock',
    sentMessages,
    parse(data: unknown): GatewayInboundMessage | null {
      if (opts.parseResult !== undefined) return opts.parseResult
      const d = data as Record<string, any>
      if (!d?.text) return null
      return {
        senderId: d.senderId ?? 'sender-1',
        text: d.text,
        raw: data,
      }
    },
    send: async (senderId, message) => {
      sentMessages.push({ senderId, message })
    },
    init: async (cb) => {
      onMessage = cb
    },
    close: async () => {
      onMessage = undefined
    },
    async simulateMessage(data: unknown) {
      if (onMessage) await onMessage(data)
    },
    ...(opts.verifyResult
      ? {
          verifyWebhook: () => opts.verifyResult!,
        }
      : {}),
  }
}

// --- Test helpers -----------------------------------------------------------

const setupState = () => {
  resetPikkuState()
  httpRouter.reset()

  const singletonServices = {
    config: {},
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    variables: {},
    secrets: {},
  }

  pikkuState(null, 'package', 'singletonServices', singletonServices as any)
  pikkuState(null, 'package', 'factories', {
    createWireServices: async () => ({}),
  } as any)
}

// --- Tests ------------------------------------------------------------------

describe('wireGateway', () => {
  beforeEach(() => {
    setupState()
  })

  describe('type: webhook', () => {
    test('registers POST route and processes messages', async () => {
      const adapter = createMockAdapter()
      const funcCalls: any[] = []

      wireGateway({
        name: 'test-webhook',
        type: 'webhook',
        route: '/webhooks/test',
        adapter,
        func: {
          func: async (_services: any, data: any, wire: any) => {
            funcCalls.push({ data, gateway: wire.gateway })
            return { text: 'reply' }
          },
        },
      })

      httpRouter.initialize()

      const request = new Request('http://localhost/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 'user-1', text: 'hello' }),
      })

      const response = await fetch(request)
      assert.equal(response.status, 200)

      // Verify func was called with parsed message
      assert.equal(funcCalls.length, 1)
      assert.equal(funcCalls[0].data.senderId, 'user-1')
      assert.equal(funcCalls[0].data.text, 'hello')

      // Verify wire.gateway was populated
      assert.equal(funcCalls[0].gateway.gatewayName, 'test-webhook')
      assert.equal(funcCalls[0].gateway.senderId, 'user-1')
      assert.equal(funcCalls[0].gateway.platform, 'mock')
      assert.equal(typeof funcCalls[0].gateway.send, 'function')

      // Verify auto-send of response
      assert.equal(adapter.sentMessages.length, 1)
      assert.equal(adapter.sentMessages[0].senderId, 'user-1')
      assert.equal(adapter.sentMessages[0].message.text, 'reply')
    })

    test('returns 200 OK for ignored events (adapter returns null)', async () => {
      const adapter = createMockAdapter({ parseResult: null })
      const funcCalls: any[] = []

      wireGateway({
        name: 'test-ignore',
        type: 'webhook',
        route: '/webhooks/ignore',
        adapter,
        func: {
          func: async () => {
            funcCalls.push(true)
          },
        },
      })

      httpRouter.initialize()

      const request = new Request('http://localhost/webhooks/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'delivery_receipt' }),
      })

      const response = await fetch(request)
      assert.equal(response.status, 200)

      // Func should NOT be called
      assert.equal(funcCalls.length, 0)
    })

    test('runs middleware before func with wire.gateway available', async () => {
      const adapter = createMockAdapter()
      const middlewareCalls: any[] = []

      const testMiddleware: CorePikkuMiddleware = async (
        _services,
        wire,
        next
      ) => {
        middlewareCalls.push({
          gateway: (wire as any).gateway,
          hasSession: !!wire.session,
        })
        wire.setSession?.({ userId: 'resolved-user' } as any)
        await next()
      }

      wireGateway({
        name: 'test-middleware',
        type: 'webhook',
        route: '/webhooks/mw',
        adapter,
        middleware: [testMiddleware],
        func: {
          func: async (_services: any, _data: any, wire: any) => {
            return { text: `hello ${wire.session?.userId ?? 'unknown'}` }
          },
        },
      })

      httpRouter.initialize()

      const request = new Request('http://localhost/webhooks/mw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 'user-2', text: 'hi' }),
      })

      await fetch(request)

      // Middleware should have run
      assert.equal(middlewareCalls.length, 1)
      // Middleware should see wire.gateway
      assert.equal(middlewareCalls[0].gateway.senderId, 'user-2')
      assert.equal(middlewareCalls[0].gateway.platform, 'mock')
    })

    test('handles webhook verification via GET', async () => {
      const adapter = createMockAdapter({
        verifyResult: { verified: true, response: 'challenge-token-123' },
      })

      wireGateway({
        name: 'test-verify',
        type: 'webhook',
        route: '/webhooks/verify',
        adapter,
        func: { func: async () => {} },
      })

      httpRouter.initialize()

      const request = new Request(
        'http://localhost/webhooks/verify?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=challenge-token-123',
        { method: 'GET' }
      )

      const response = await fetch(request)
      assert.equal(response.status, 200)

      const body = await response.json()
      assert.equal(body, 'challenge-token-123')
    })

    test('handles POST-based verification (Slack style)', async () => {
      const adapter = createMockAdapter({
        parseResult: null,
        verifyResult: {
          verified: true,
          response: { challenge: 'abc123' },
        },
      })

      wireGateway({
        name: 'test-slack-verify',
        type: 'webhook',
        route: '/webhooks/slack',
        adapter,
        func: { func: async () => {} },
      })

      httpRouter.initialize()

      const request = new Request('http://localhost/webhooks/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'url_verification',
          challenge: 'abc123',
        }),
      })

      const response = await fetch(request)
      assert.equal(response.status, 200)

      const body = await response.json()
      assert.deepEqual(body, { challenge: 'abc123' })
    })

    test('wire.gateway.send() sends proactive messages', async () => {
      const adapter = createMockAdapter()
      let capturedGateway: any

      wireGateway({
        name: 'test-proactive',
        type: 'webhook',
        route: '/webhooks/proactive',
        adapter,
        func: {
          func: async (_services: any, _data: any, wire: any) => {
            capturedGateway = wire.gateway
            // Send a proactive message via gateway
            await wire.gateway.send({ text: 'proactive msg' })
            // Don't return a response (no auto-send)
          },
        },
      })

      httpRouter.initialize()

      const request = new Request('http://localhost/webhooks/proactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 'user-3', text: 'trigger' }),
      })

      await fetch(request)

      // Proactive message was sent
      assert.equal(adapter.sentMessages.length, 1)
      assert.equal(adapter.sentMessages[0].message.text, 'proactive msg')
    })
  })

  describe('type: webhook errors', () => {
    test('throws if no route provided for webhook', () => {
      const adapter = createMockAdapter()

      assert.throws(
        () =>
          wireGateway({
            name: 'no-route',
            type: 'webhook',
            adapter,
            func: { func: async () => {} },
          }),
        /requires a route/
      )
    })
  })

  describe('type: listener', () => {
    test('stores gateway config in pikkuState', () => {
      const adapter = createMockAdapter()

      wireGateway({
        name: 'test-listener',
        type: 'listener',
        adapter,
        func: { func: async () => {} },
      })

      const gateways = pikkuState(null, 'gateway', 'gateways')
      assert.ok(gateways.has('test-listener'))
      assert.equal(gateways.get('test-listener').type, 'listener')
    })
  })

  describe('createListenerMessageHandler', () => {
    test('creates handler that processes messages', async () => {
      const adapter = createMockAdapter()
      const funcCalls: any[] = []

      const config = {
        name: 'test-listener',
        type: 'listener' as const,
        adapter,
        func: {
          func: async (_services: any, data: any, wire: any) => {
            funcCalls.push({ data, gateway: wire.gateway })
            return { text: 'listener-reply' }
          },
        },
      }

      wireGateway(config)

      const singletonServices = pikkuState(null, 'package', 'singletonServices')
      const handleMessage = createListenerMessageHandler(
        'test-listener',
        config,
        singletonServices
      )

      // Simulate incoming message
      await handleMessage({
        senderId: 'listener-user',
        text: 'hello from listener',
      })

      assert.equal(funcCalls.length, 1)
      assert.equal(funcCalls[0].data.senderId, 'listener-user')
      assert.equal(funcCalls[0].data.text, 'hello from listener')
      assert.equal(funcCalls[0].gateway.platform, 'mock')

      // Auto-send response
      assert.equal(adapter.sentMessages.length, 1)
      assert.equal(adapter.sentMessages[0].message.text, 'listener-reply')
    })

    test('handler ignores events when adapter returns null', async () => {
      const adapter = createMockAdapter({ parseResult: null })
      const funcCalls: any[] = []

      const config = {
        name: 'test-listener-ignore',
        type: 'listener' as const,
        adapter,
        func: {
          func: async () => {
            funcCalls.push(true)
          },
        },
      }

      wireGateway(config)

      const singletonServices = pikkuState(null, 'package', 'singletonServices')
      const handleMessage = createListenerMessageHandler(
        'test-listener-ignore',
        config,
        singletonServices
      )

      await handleMessage({ type: 'delivery_receipt' })

      assert.equal(funcCalls.length, 0)
    })
  })

  describe('gateway: true metadata flag', () => {
    test('webhook gateway adds gateway meta to pikkuState', () => {
      const adapter = createMockAdapter()

      wireGateway({
        name: 'test-meta',
        type: 'webhook',
        route: '/webhooks/meta',
        adapter,
        func: { func: async () => {} },
      })

      const gateways = pikkuState(null, 'gateway', 'gateways')
      const config = gateways.get('test-meta')
      assert.ok(config)
      assert.equal(config.type, 'webhook')
      assert.equal(config.name, 'test-meta')
    })
  })

  describe('type: websocket', () => {
    test('registers channel config', () => {
      const adapter = createMockAdapter()

      wireGateway({
        name: 'test-ws',
        type: 'websocket',
        route: '/gateway/ws',
        adapter,
        func: { func: async () => {} },
      })

      const channels = pikkuState(null, 'channel', 'channels')
      assert.ok(channels.has('test-ws'))
    })

    test('throws if no route provided', () => {
      const adapter = createMockAdapter()

      assert.throws(
        () =>
          wireGateway({
            name: 'no-route-ws',
            type: 'websocket',
            adapter,
            func: { func: async () => {} },
          }),
        /requires a route/
      )
    })
  })
})
