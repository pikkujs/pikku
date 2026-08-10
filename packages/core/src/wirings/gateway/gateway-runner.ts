import { pikkuState } from '../../pikku-state.js'
import { NotFoundError, UnauthorizedError } from '../../errors/errors.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { runMiddleware } from '../../middleware-runner.js'
import { httpRouter } from '../http/routers/http-router.js'
import type { CoreHTTPFunctionWiring } from '../http/http.types.js'
import type {
  CoreGateway,
  GatewayAdapter,
  GatewayOutboundMessage,
  PikkuGateway,
} from './gateway.types.js'

const resolvedAdapters = new WeakMap<CoreGateway, Promise<GatewayAdapter>>()

const gatewayHandlerFuncId = (name: string) => `gateway__${name}__handler`

// knowledge: decisions/security/gateway-middleware-sessions-must-be-bridged-onto-the-wire.md
const bridgeMiddlewareSession = async (wire: PikkuRawWire): Promise<void> => {
  if (wire.session || !wire.getSession) return
  const session = await wire.getSession()
  if (session) {
    wire.session = session
  }
}

/**
 * Metadata the inspector recorded for the function the gateway was wired with.
 * The bootstrap loads every meta file before any wiring file, so this is
 * already populated by the time a gateway wires itself. A gateway wired by
 * hand rather than through codegen has no entry, and falls back to the
 * sessionless default below.
 */
const declaredHandlerMeta = (config: CoreGateway) => {
  const declaredFuncId = pikkuState(null, 'gateway', 'meta')[config.name]
    ?.pikkuFuncId
  return declaredFuncId
    ? pikkuState(null, 'function', 'meta')[declaredFuncId]
    : undefined
}

// knowledge: decisions/security/gateway-handlers-run-through-the-function-runner-gate.md
const registerGatewayHandler = (config: CoreGateway): string => {
  const funcId = gatewayHandlerFuncId(config.name)
  const funcMeta = pikkuState(null, 'function', 'meta')
  const declared = declaredHandlerMeta(config)
  funcMeta[funcId] = {
    ...declared,
    pikkuFuncId: funcId,
    inputSchemaName: declared?.inputSchemaName ?? null,
    outputSchemaName: declared?.outputSchemaName ?? null,
    sessionless: declared?.sessionless ?? true,
  }
  addFunction(funcId, config.func)
  return funcId
}

/**
 * Tag middleware the inspector resolved for this gateway. It is keyed by
 * gateway name rather than reachable from `config`, because `tags` is a
 * compile-time input everywhere — nothing at runtime maps a tag to its
 * middleware group.
 */
const gatewayInheritedMiddleware = (config: CoreGateway) =>
  pikkuState(null, 'gateway', 'meta')[config.name]?.middleware

export const resolveGatewayAdapter = (
  config: CoreGateway,
  services: CoreSingletonServices
): Promise<GatewayAdapter> => {
  let resolved = resolvedAdapters.get(config)
  if (!resolved) {
    resolved =
      typeof config.adapter === 'function'
        ? Promise.resolve(config.adapter(services))
        : Promise.resolve(config.adapter)
    resolvedAdapters.set(config, resolved)
  }
  return resolved
}
import type {
  PikkuWire,
  PikkuRawWire,
  CorePikkuMiddleware,
  CoreSingletonServices,
} from '../../types/core.types.js'

export const wireGateway = (config: CoreGateway): void => {
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
        `Unknown gateway type '${config.type}' for gateway '${config.name}'`
      )
  }
}

const wireWebhookGateway = (config: CoreGateway): void => {
  const { name, route, adapter } = config
  if (!route) {
    throw new Error(`Webhook gateway '${name}' requires a route`)
  }

  const postFuncId = `gateway__${name}__post`
  const routes = pikkuState(null, 'http', 'routes')

  const postHandler = {
    auth: false,
    func: createWebhookPostHandler(config),
  }

  addFunction(postFuncId, postHandler)

  if (!routes.has('post')) {
    routes.set('post', new Map())
  }
  routes.get('post')!.set(route, {
    method: 'post',
    route,
    func: postHandler,
    auth: false,
    // A gateway handler takes (services, data, wire) rather than a pikku
    // function's shape, so it never matches CorePikkuFunctionConfig. It is only
    // ever invoked through runPikkuFunc, which is what makes that safe.
  } as unknown as CoreHTTPFunctionWiring<unknown, unknown, string>)

  // knowledge: decisions/internals/gateway-adapters-resolve-lazily-and-are-promise-cached.md
  if (typeof adapter === 'function' || adapter.verifyWebhook) {
    const verifyFuncId = `gateway__${name}__verify`

    const verifyHandler = {
      auth: false,
      func: createWebhookVerifyHandler(config),
    }

    addFunction(verifyFuncId, verifyHandler)

    if (!routes.has('get')) {
      routes.set('get', new Map())
    }
    routes.get('get')!.set(route, {
      method: 'get',
      route,
      func: verifyHandler,
      auth: false,
      // knowledge: decisions/internals/gateway-webhook-challenges-echo-bytes-not-json.md
      returnsJSON: false,
    } as unknown as CoreHTTPFunctionWiring<unknown, unknown, string>)
  }

  httpRouter.reset()
}

const createWebhookPostHandler = (config: CoreGateway) => {
  const { name, middleware: userMiddleware } = config
  const handlerFuncId = registerGatewayHandler(config)
  const inheritedMiddleware = gatewayInheritedMiddleware(config)

  return async (
    services: CoreSingletonServices,
    data: unknown,
    wire: PikkuWire
  ) => {
    const adapter = await resolveGatewayAdapter(config, services)

    if (adapter.verifyWebhook) {
      const verifyResult = await adapter.verifyWebhook(data, wire.http?.request)
      if (verifyResult.verified) {
        return verifyResult.response
      }
    }

    const parsed = adapter.parse(data)
    if (!parsed) {
      return { ok: true }
    }

    const gateway: PikkuGateway = {
      gatewayName: name,
      senderId: parsed.senderId,
      platform: adapter.name,
      send: (msg: GatewayOutboundMessage) => adapter.send(parsed.senderId, msg),
    }
    wire.gateway = gateway

    // Gateway middleware runs outside the gate so it can establish the session the gate checks.
    const invoke = async () => {
      await bridgeMiddlewareSession(wire)
      return await runPikkuFunc('gateway', name, handlerFuncId, {
        singletonServices: services,
        data: () => parsed,
        auth: config.auth,
        inheritedMiddleware,
        wire,
      })
    }

    const gatewayMiddleware = userMiddleware as
      | CorePikkuMiddleware[]
      | undefined
    const result: any = gatewayMiddleware?.length
      ? await runMiddleware(services, wire, gatewayMiddleware, invoke)
      : await invoke()

    if (result && (result.text || result.richContent || result.attachments)) {
      await adapter.send(parsed.senderId, result as GatewayOutboundMessage)
    }
    return { ok: true }
  }
}

const createWebhookVerifyHandler = (config: CoreGateway) => {
  return async (
    services: CoreSingletonServices,
    _data: unknown,
    wire: PikkuWire
  ) => {
    const adapter = await resolveGatewayAdapter(config, services)
    if (!adapter.verifyWebhook) {
      throw new NotFoundError(
        `Gateway '${config.name}' does not support webhook verification`
      )
    }

    const query = wire.http?.request?.query()
    const result = await adapter.verifyWebhook(query, wire.http?.request)
    if (!result.verified) {
      throw new UnauthorizedError('Webhook verification failed')
    }
    // knowledge: decisions/internals/gateway-webhook-challenges-echo-bytes-not-json.md
    const response = result.response
    if (typeof response === 'string' || typeof response === 'number') {
      return String(response)
    }
    wire.http?.response?.header('content-type', 'application/json')
    return JSON.stringify(response)
  }
}

const wireWebsocketGateway = (config: CoreGateway): void => {
  const { name, route } = config
  if (!route) {
    throw new Error(`WebSocket gateway '${name}' requires a route`)
  }

  pikkuState(null, 'gateway', 'gateways').set(config.name, config)

  const channelsMeta = pikkuState(null, 'channel', 'meta')
  const channels = pikkuState(null, 'channel', 'channels')

  const messageFuncId = `gateway__${name}__message`
  const connectFuncId = `gateway__${name}__connect`

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

  channelsMeta[name] = {
    name,
    route,
    gateway: true,
    input: null,
    connect: { pikkuFuncId: connectFuncId },
    disconnect: null,
    message: { pikkuFuncId: messageFuncId },
    messageWirings: {},
  }

  const userMiddleware = config.middleware as CorePikkuMiddleware[] | undefined
  const handlerFuncId = registerGatewayHandler(config)
  const inheritedMiddleware = gatewayInheritedMiddleware(config)

  addFunction(connectFuncId, {
    auth: false,
    func: async (services: any, _data: unknown, wire: PikkuWire) => {
      const adapter = await resolveGatewayAdapter(config, services)
      wire.gateway = {
        gatewayName: name,
        senderId: '',
        platform: adapter.name,
        send: async (msg: GatewayOutboundMessage) => {
          wire.channel?.send(msg)
        },
      } satisfies PikkuGateway
    },
  })

  addFunction(messageFuncId, {
    auth: false,
    func: async (services: any, data: unknown, wire: PikkuWire) => {
      const adapter = await resolveGatewayAdapter(config, services)
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
      wire.gateway = gateway

      const invoke = async () => {
        await bridgeMiddlewareSession(wire)
        return await runPikkuFunc('gateway', name, handlerFuncId, {
          singletonServices: services,
          data: () => parsed,
          auth: config.auth,
          inheritedMiddleware,
          wire,
        })
      }

      const gatewayMiddleware = userMiddleware as
        | CorePikkuMiddleware[]
        | undefined
      const result: any = gatewayMiddleware?.length
        ? await runMiddleware(services, wire, gatewayMiddleware, invoke)
        : await invoke()

      if (result && (result.text || result.richContent || result.attachments)) {
        wire.channel?.send(result)
      }
    },
  })

  // knowledge: decisions/internals/gateway-wiring-is-a-meta-wiring-over-http-and-channels.md
  channels.set(name, {
    name,
    route,
    auth: false,
    onConnect: { func: async () => {} },
    onMessage: { func: async () => {} },
  })

  httpRouter.reset()
}

const wireListenerGateway = (config: CoreGateway): void => {
  pikkuState(null, 'gateway', 'gateways').set(config.name, config)
}

/** The returned callback is what a GatewayService passes to `adapter.init()`. */
export const createListenerMessageHandler = (
  name: string,
  config: CoreGateway,
  singletonServices: CoreSingletonServices
): ((rawData: unknown) => Promise<void>) => {
  const userMiddleware = config.middleware as CorePikkuMiddleware[] | undefined
  const handlerFuncId = registerGatewayHandler(config)
  const inheritedMiddleware = gatewayInheritedMiddleware(config)

  return async (rawData: unknown): Promise<void> => {
    const adapter = await resolveGatewayAdapter(config, singletonServices)
    const parsed = adapter.parse(rawData)
    if (!parsed) return

    const wire: PikkuRawWire = {}
    const gateway: PikkuGateway = {
      gatewayName: name,
      senderId: parsed.senderId,
      platform: adapter.name,
      send: (msg: GatewayOutboundMessage) => adapter.send(parsed.senderId, msg),
    }
    wire.gateway = gateway

    const invoke = async () => {
      await bridgeMiddlewareSession(wire)
      return await runPikkuFunc('gateway', name, handlerFuncId, {
        singletonServices,
        data: () => parsed,
        auth: config.auth,
        inheritedMiddleware,
        wire,
      })
    }

    // knowledge: decisions/internals/gateway-listener-middleware-runs-without-an-rpc-on-the-wire.md
    const result: any = userMiddleware?.length
      ? await runMiddleware(
          singletonServices,
          wire as PikkuWire,
          userMiddleware,
          invoke
        )
      : await invoke()

    if (result && (result.text || result.richContent || result.attachments)) {
      await adapter.send(parsed.senderId, result as GatewayOutboundMessage)
    }
  }
}
