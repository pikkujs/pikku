import { test, describe, beforeEach } from 'node:test'
import * as assert from 'assert'
import { wireGateway, createListenerMessageHandler } from './gateway-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { httpRouter } from '../http/routers/http-router.js'
import { fetch } from '../http/http-runner.js'
import {
  addGlobalPermission,
  clearPermissionsCache,
} from '../../permissions.js'
import type {
  GatewayAdapter,
  GatewayInboundMessage,
  GatewayOutboundMessage,
} from './gateway.types.js'

const createMockAdapter = (): GatewayAdapter & {
  sentMessages: Array<{ senderId: string; message: GatewayOutboundMessage }>
} => {
  const sentMessages: Array<{
    senderId: string
    message: GatewayOutboundMessage
  }> = []

  return {
    name: 'mock',
    sentMessages,
    parse(data: unknown): GatewayInboundMessage | null {
      const d = data as Record<string, any>
      if (!d?.text) return null
      return { senderId: d.senderId ?? 'sender-1', text: d.text, raw: data }
    },
    send: async (senderId, message) => {
      sentMessages.push({ senderId, message })
    },
    init: async () => {},
    close: async () => {},
  }
}

const singletonServices = {
  config: {},
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
  variables: {},
  secrets: {},
}

const setupState = () => {
  resetPikkuState()
  httpRouter.reset()
  clearPermissionsCache()
  pikkuState(null, 'package', 'singletonServices', singletonServices as any)
  pikkuState(null, 'package', 'factories', {
    createWireServices: async () => ({}),
  } as any)
}

const seedCompiledMeta = () => {
  const httpMeta = pikkuState(null, 'http', 'meta') as any
  const funcMeta = pikkuState(null, 'function', 'meta') as any
  for (const config of pikkuState(null, 'gateway', 'gateways').values()) {
    if (config.type !== 'webhook' || !config.route) continue
    for (const [method, funcId] of [
      ['post', `gateway__${config.name}__post`],
      ['get', `gateway__${config.name}__verify`],
    ] as const) {
      httpMeta[method][config.route] = {
        pikkuFuncId: funcId,
        route: config.route,
        method,
      }
      funcMeta[funcId] = {
        pikkuFuncId: funcId,
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless: true,
      }
    }
  }
}

const postMessage = async (route: string) => {
  const request = new Request(`http://localhost${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderId: 'user-1', text: 'hello' }),
  })
  return await fetch(request)
}

describe('gateway handler authorization', () => {
  beforeEach(() => {
    setupState()
  })

  describe('webhook gateway', () => {
    test('a denying permission on the handler blocks it', async () => {
      const calls: string[] = []

      wireGateway({
        name: 'perm-deny',
        type: 'webhook',
        route: '/webhooks/perm-deny',
        adapter: createMockAdapter(),
        func: {
          permissions: { denied: async () => false },
          func: async () => {
            calls.push('ran')
            return { text: 'reply' }
          },
        } as any,
      })

      seedCompiledMeta()
      httpRouter.initialize()

      const response = await postMessage('/webhooks/perm-deny')

      assert.equal(response.status, 403)
      assert.deepEqual(calls, [], 'handler must not run when permissions deny')
    })

    test('a passing permission on the handler allows it', async () => {
      const calls: string[] = []

      wireGateway({
        name: 'perm-allow',
        type: 'webhook',
        route: '/webhooks/perm-allow',
        adapter: createMockAdapter(),
        func: {
          permissions: { allowed: async () => true },
          func: async () => {
            calls.push('ran')
            return { text: 'reply' }
          },
        } as any,
      })

      seedCompiledMeta()
      httpRouter.initialize()

      const response = await postMessage('/webhooks/perm-allow')

      assert.equal(response.status, 200)
      assert.deepEqual(calls, ['ran'])
    })

    test('handler scopes are enforced and fail closed without a session', async () => {
      const calls: string[] = []

      wireGateway({
        name: 'scope-gate',
        type: 'webhook',
        route: '/webhooks/scope-gate',
        adapter: createMockAdapter(),
        func: {
          scopes: ['admin:webhooks'],
          func: async () => {
            calls.push('ran')
            return { text: 'reply' }
          },
        } as any,
      })

      seedCompiledMeta()
      httpRouter.initialize()

      const response = await postMessage('/webhooks/scope-gate')

      assert.equal(response.status, 403)
      assert.deepEqual(calls, [], 'handler must not run without the scope')
    })

    test('global permissions apply to gateway handlers', async () => {
      const calls: string[] = []

      addGlobalPermission([async () => false])

      wireGateway({
        name: 'global-deny',
        type: 'webhook',
        route: '/webhooks/global-deny',
        adapter: createMockAdapter(),
        func: {
          func: async () => {
            calls.push('ran')
            return { text: 'reply' }
          },
        } as any,
      })

      seedCompiledMeta()
      httpRouter.initialize()

      const response = await postMessage('/webhooks/global-deny')

      assert.equal(response.status, 403)
      assert.deepEqual(calls, [], 'a denying global must block the handler')
    })

    test('a handler with no authorization declared still runs', async () => {
      const calls: string[] = []

      wireGateway({
        name: 'open',
        type: 'webhook',
        route: '/webhooks/open',
        adapter: createMockAdapter(),
        func: {
          func: async () => {
            calls.push('ran')
            return { text: 'reply' }
          },
        } as any,
      })

      seedCompiledMeta()
      httpRouter.initialize()

      const response = await postMessage('/webhooks/open')

      assert.equal(response.status, 200)
      assert.deepEqual(calls, ['ran'])
    })

    test('gateway-level auth: true requires a session', async () => {
      const calls: string[] = []

      wireGateway({
        name: 'gw-auth',
        type: 'webhook',
        route: '/webhooks/gw-auth',
        adapter: createMockAdapter(),
        auth: true,
        func: {
          func: async () => {
            calls.push('ran')
            return { text: 'reply' }
          },
        } as any,
      })

      seedCompiledMeta()
      httpRouter.initialize()

      const response = await postMessage('/webhooks/gw-auth')

      assert.equal(response.status, 403)
      assert.deepEqual(calls, [], 'auth: true must require a session')
    })

    test('handler-level auth: true requires a session', async () => {
      const calls: string[] = []

      wireGateway({
        name: 'handler-auth',
        type: 'webhook',
        route: '/webhooks/handler-auth',
        adapter: createMockAdapter(),
        func: {
          auth: true,
          func: async () => {
            calls.push('ran')
            return { text: 'reply' }
          },
        } as any,
      })

      seedCompiledMeta()
      httpRouter.initialize()

      const response = await postMessage('/webhooks/handler-auth')

      assert.equal(response.status, 403)
      assert.deepEqual(calls, [], 'auth: true must require a session')
    })

    test('the adapter still auto-sends the handler reply', async () => {
      const adapter = createMockAdapter()

      wireGateway({
        name: 'reply',
        type: 'webhook',
        route: '/webhooks/reply',
        adapter,
        func: {
          permissions: { allowed: async () => true },
          func: async () => ({ text: 'pong' }),
        } as any,
      })

      seedCompiledMeta()
      httpRouter.initialize()

      await postMessage('/webhooks/reply')

      assert.equal(adapter.sentMessages.length, 1)
      assert.equal(adapter.sentMessages[0].message.text, 'pong')
    })

    test('a session set by gateway middleware satisfies the handler gate', async () => {
      const seen: any[] = []

      wireGateway({
        name: 'mw-session',
        type: 'webhook',
        route: '/webhooks/mw-session',
        adapter: createMockAdapter(),
        auth: true,
        middleware: [
          async (_s: any, wire: any, next: any) => {
            await wire.setSession({
              userId: 'mapped-user',
              scopes: ['gateway:inbound'],
            })
            await next()
          },
        ] as any,
        func: {
          scopes: ['gateway:inbound'],
          func: async (_s: any, _d: any, wire: any) => {
            seen.push(wire.session)
            return { text: 'ok' }
          },
        } as any,
      })

      seedCompiledMeta()
      httpRouter.initialize()

      const response = await postMessage('/webhooks/mw-session')

      assert.equal(response.status, 200)
      assert.equal(seen[0]?.userId, 'mapped-user')
    })

    test('handler middleware still runs, and only once', async () => {
      const order: string[] = []

      wireGateway({
        name: 'mw',
        type: 'webhook',
        route: '/webhooks/mw',
        adapter: createMockAdapter(),
        func: {
          middleware: [
            async (_s: any, _w: any, next: any) => {
              order.push('func-mw')
              await next()
            },
          ],
          func: async () => {
            order.push('handler')
            return { text: 'ok' }
          },
        } as any,
        middleware: [
          async (_s: any, _w: any, next: any) => {
            order.push('gateway-mw')
            await next()
          },
        ] as any,
      })

      seedCompiledMeta()
      httpRouter.initialize()

      await postMessage('/webhooks/mw')

      assert.deepEqual(order, ['gateway-mw', 'func-mw', 'handler'])
    })
  })

  describe('listener gateway', () => {
    test('a denying permission on the handler blocks it', async () => {
      const calls: string[] = []
      const adapter = createMockAdapter()

      const config = {
        name: 'listen-deny',
        type: 'listener' as const,
        adapter,
        func: {
          permissions: { denied: async () => false },
          func: async () => {
            calls.push('ran')
            return { text: 'reply' }
          },
        },
      }

      wireGateway(config as any)

      const handler = createListenerMessageHandler(
        config.name,
        config as any,
        singletonServices as any
      )

      await assert.rejects(
        () => handler({ senderId: 'user-1', text: 'hello' }),
        /Permission denied/
      )
      assert.deepEqual(calls, [], 'handler must not run when permissions deny')
    })

    test('a passing permission on the handler allows it', async () => {
      const calls: string[] = []
      const adapter = createMockAdapter()

      const config = {
        name: 'listen-allow',
        type: 'listener' as const,
        adapter,
        func: {
          permissions: { allowed: async () => true },
          func: async () => {
            calls.push('ran')
            return { text: 'reply' }
          },
        },
      }

      wireGateway(config as any)

      const handler = createListenerMessageHandler(
        config.name,
        config as any,
        singletonServices as any
      )

      await handler({ senderId: 'user-1', text: 'hello' })

      assert.deepEqual(calls, ['ran'])
      assert.equal(adapter.sentMessages.length, 1)
    })
  })
})
