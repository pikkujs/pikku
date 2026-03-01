import { pikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'
import { runMiddleware } from '../../middleware-runner.js'
import { httpRouter } from '../http/routers/http-router.js'
import type {
  CoreGateway,
  GatewayAdapter,
  GatewayOutboundMessage,
  PikkuGateway,
} from './gateway.types.js'
import type {
  PikkuWire,
  CorePikkuMiddleware,
  CoreSingletonServices,
} from '../../types/core.types.js'
import type { HTTPWiringMeta } from '../http/http.types.js'

/**
 * Register a messaging gateway.
 *
 * `wireGateway` is a meta-wiring that composes existing primitives
 * (`wireHTTP`, `wireChannel`) under the hood.  It does not replace them;
 * it layers on top.
 *
 * @param config - Gateway configuration (name, type, adapter, func, middleware, etc.)
 */
export const wireGateway = (config: CoreGateway): void => {
  // Store gateway config
  pikkuState(null, 'gateway', 'gateways').set(config.name, config)

  switch (config.type) {
    case 'webhook':
      wireWebhookGateway(config)
      break
    case 'websocket':
      wireWebsocketGateway(config)
      break
    case 'listener':
      wireListenerGateway(config)
      break
    default:
      throw new Error(
        `Unknown gateway type '${(config as any).type}' for gateway '${config.name}'`
      )
  }
}

// ---------------------------------------------------------------------------
// Webhook gateway — platform POSTs to us
// ---------------------------------------------------------------------------

const wireWebhookGateway = (config: CoreGateway): void => {
  const { name, route, adapter } = config
  if (!route) {
    throw new Error(`Webhook gateway '${name}' requires a route`)
  }

  const postFuncId = `gateway__${name}__post`
  const httpMeta = pikkuState(null, 'http', 'meta')
  const funcMeta = pikkuState(null, 'function', 'meta')
  const routes = pikkuState(null, 'http', 'routes')

  // --- POST handler (main message receiver) --------------------------------

  funcMeta[postFuncId] = {
    pikkuFuncId: postFuncId,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  }

  httpMeta['post'][route] = {
    pikkuFuncId: postFuncId,
    route,
    method: 'post',
  } as HTTPWiringMeta

  const postHandler = {
    auth: false,
    func: createWebhookPostHandler(config),
  }

  addFunction(postFuncId, postHandler as any)

  if (!routes.has('post')) {
    routes.set('post', new Map())
  }
  routes.get('post')!.set(route, {
    method: 'post',
    route,
    func: postHandler,
    auth: false,
  } as any)

  // --- GET handler (webhook verification, e.g. WhatsApp challenge) ---------

  if (adapter.verifyWebhook) {
    const verifyFuncId = `gateway__${name}__verify`

    funcMeta[verifyFuncId] = {
      pikkuFuncId: verifyFuncId,
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: true,
    }

    httpMeta['get'][route] = {
      pikkuFuncId: verifyFuncId,
      route,
      method: 'get',
    } as HTTPWiringMeta

    const verifyHandler = {
      auth: false,
      func: createWebhookVerifyHandler(adapter),
    }

    addFunction(verifyFuncId, verifyHandler as any)

    if (!routes.has('get')) {
      routes.set('get', new Map())
    }
    routes.get('get')!.set(route, {
      method: 'get',
      route,
      func: verifyHandler,
      auth: false,
    } as any)
  }

  // Force router to re-initialize on next match
  httpRouter.reset()
}

/**
 * Creates the POST handler function for a webhook gateway.
 *
 * Flow:
 *  1. Check for POST-based verification (e.g. Slack `url_verification`)
 *  2. Parse body via adapter → GatewayInboundMessage (or null to ignore)
 *  3. Populate `wire.gateway`
 *  4. Run user middleware (which can read `wire.gateway` for auth)
 *  5. Call user func with parsed message
 *  6. Auto-send response via adapter if func returns outbound content
 */
const createWebhookPostHandler = (config: CoreGateway) => {
  const { name, adapter, func: userFunc, middleware: userMiddleware } = config
  const userFuncConfig = userFunc as {
    func: Function
    middleware?: CorePikkuMiddleware[]
  }

  return async (
    services: CoreSingletonServices,
    data: unknown,
    wire: PikkuWire
  ) => {
    // Check for POST-based webhook verification (e.g. Slack url_verification)
    if (adapter.verifyWebhook) {
      const verifyResult = await adapter.verifyWebhook(data, wire.http?.request)
      if (verifyResult.verified) {
        return verifyResult.response
      }
    }

    // Parse the platform-specific payload
    const parsed = adapter.parse(data)
    if (!parsed) {
      // Ignored event (delivery receipt, typing indicator, etc.)
      return { ok: true }
    }

    // Populate wire.gateway
    const gateway: PikkuGateway = {
      gatewayName: name,
      senderId: parsed.senderId,
      platform: adapter.name,
      send: (msg: GatewayOutboundMessage) => adapter.send(parsed.senderId, msg),
    }
    ;(wire as any).gateway = gateway

    // Build combined middleware chain: gateway-level + func-level
    const allMiddleware: CorePikkuMiddleware[] = [
      ...((userMiddleware as CorePikkuMiddleware[] | undefined) || []),
      ...(userFuncConfig.middleware || []),
    ]

    const exec = async () => {
      const result = await userFuncConfig.func(services, parsed, wire)
      // Auto-send response if the func returns outbound content
      if (result && (result.text || result.richContent || result.attachments)) {
        await adapter.send(parsed.senderId, result as GatewayOutboundMessage)
      }
      return { ok: true }
    }

    if (allMiddleware.length > 0) {
      return await runMiddleware(services, wire, allMiddleware, exec)
    }

    return await exec()
  }
}

/**
 * Creates the GET handler for webhook verification challenges.
 * Passes query parameters to the adapter's verifyWebhook method.
 */
const createWebhookVerifyHandler = (adapter: GatewayAdapter) => {
  return async (
    _services: CoreSingletonServices,
    _data: unknown,
    wire: PikkuWire
  ) => {
    if (!adapter.verifyWebhook) {
      return { error: 'Verification not supported' }
    }

    const query = wire.http?.request?.query()
    const result = await adapter.verifyWebhook(query, wire.http?.request)
    if (result.verified) {
      return result.response
    }

    return { error: 'Verification failed' }
  }
}

// ---------------------------------------------------------------------------
// WebSocket gateway — client connects via WebSocket
// ---------------------------------------------------------------------------

const wireWebsocketGateway = (config: CoreGateway): void => {
  const { name, route, adapter } = config
  if (!route) {
    throw new Error(`WebSocket gateway '${name}' requires a route`)
  }

  // Store gateway config — the channel runner will reference this
  pikkuState(null, 'gateway', 'gateways').set(config.name, config)

  const channelsMeta = pikkuState(null, 'channel', 'meta')
  const channels = pikkuState(null, 'channel', 'channels')

  const messageFuncId = `gateway__${name}__message`
  const connectFuncId = `gateway__${name}__connect`

  // Add function metadata
  const funcMeta = pikkuState(null, 'function', 'meta')
  funcMeta[messageFuncId] = {
    pikkuFuncId: messageFuncId,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  }
  funcMeta[connectFuncId] = {
    pikkuFuncId: connectFuncId,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  }

  // Add channel metadata
  channelsMeta[name] = {
    name,
    route,
    gateway: true,
    connect: { pikkuFuncId: connectFuncId },
    message: { pikkuFuncId: messageFuncId },
  } as any

  const userFuncConfig = config.func as {
    func: Function
    middleware?: CorePikkuMiddleware[]
  }
  const userMiddleware = config.middleware as CorePikkuMiddleware[] | undefined

  // Register onConnect
  addFunction(connectFuncId, {
    auth: false,
    func: async (_services: any, _data: unknown, wire: PikkuWire) => {
      ;(wire as any).gateway = {
        gatewayName: name,
        senderId: '',
        platform: adapter.name,
        send: async (msg: GatewayOutboundMessage) => {
          wire.channel?.send(msg)
        },
      } satisfies PikkuGateway
    },
  } as any)

  // Register onMessage
  addFunction(messageFuncId, {
    auth: false,
    func: async (services: any, data: unknown, wire: PikkuWire) => {
      const parsed = adapter.parse(data)
      if (!parsed) return

      const gateway: PikkuGateway = {
        gatewayName: name,
        senderId: parsed.senderId,
        platform: adapter.name,
        send: async (msg: GatewayOutboundMessage) => {
          wire.channel?.send(msg)
        },
      }
      ;(wire as any).gateway = gateway

      const allMiddleware: CorePikkuMiddleware[] = [
        ...(userMiddleware || []),
        ...(userFuncConfig.middleware || []),
      ]

      const exec = async () => {
        const result = await userFuncConfig.func(services, parsed, wire)
        if (
          result &&
          (result.text || result.richContent || result.attachments)
        ) {
          wire.channel?.send(result)
        }
      }

      if (allMiddleware.length > 0) {
        await runMiddleware(services, wire, allMiddleware, exec)
      } else {
        await exec()
      }
    },
  } as any)

  // Store channel config
  channels.set(name, {
    name,
    route,
    auth: false,
    onConnect: { func: async () => {} },
    onMessage: { func: async () => {} },
  } as any)

  // Force router to re-initialize
  httpRouter.reset()
}

// ---------------------------------------------------------------------------
// Listener gateway — standalone event loop, no route
// ---------------------------------------------------------------------------

const wireListenerGateway = (config: CoreGateway): void => {
  // Listener gateways don't register routes.
  // They are started manually and call into the gateway's func directly.
  // The gateway config is already stored in pikkuState.
  pikkuState(null, 'gateway', 'gateways').set(config.name, config)
}

/**
 * Create the message handler callback for a listener gateway.
 *
 * Returns a function `(rawData: unknown) => Promise<void>` that can be
 * passed to `adapter.init()`.  Used by `LocalGatewayService` (and any
 * other GatewayService implementation) to wire up listener gateways.
 *
 * @param name   - Gateway name (for wire.gateway metadata)
 * @param config - The gateway configuration (adapter, func, middleware)
 * @param singletonServices - Singleton services to pass to handler/middleware
 */
export const createListenerMessageHandler = (
  name: string,
  config: CoreGateway,
  singletonServices: CoreSingletonServices
): ((rawData: unknown) => Promise<void>) => {
  const { adapter } = config
  const userFuncConfig = config.func as {
    func: Function
    middleware?: CorePikkuMiddleware[]
  }
  const userMiddleware = config.middleware as CorePikkuMiddleware[] | undefined

  return async (rawData: unknown): Promise<void> => {
    const parsed = adapter.parse(rawData)
    if (!parsed) return

    const wire: PikkuWire = {}
    const gateway: PikkuGateway = {
      gatewayName: name,
      senderId: parsed.senderId,
      platform: adapter.name,
      send: (msg: GatewayOutboundMessage) => adapter.send(parsed.senderId, msg),
    }
    ;(wire as any).gateway = gateway

    const allMiddleware: CorePikkuMiddleware[] = [
      ...(userMiddleware || []),
      ...(userFuncConfig.middleware || []),
    ]

    const exec = async () => {
      const result = await userFuncConfig.func(singletonServices, parsed, wire)
      if (result && (result.text || result.richContent || result.attachments)) {
        await adapter.send(parsed.senderId, result as GatewayOutboundMessage)
      }
    }

    if (allMiddleware.length > 0) {
      await runMiddleware(singletonServices, wire, allMiddleware, exec)
    } else {
      await exec()
    }
  }
}
