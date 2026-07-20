import { pikkuState } from '../../pikku-state.js'
import { NotFoundError, UnauthorizedError } from '../../errors/errors.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { runMiddleware } from '../../middleware-runner.js'
import { httpRouter } from '../http/routers/http-router.js'
import type {
  CoreGateway,
  GatewayAdapter,
  GatewayOutboundMessage,
  PikkuGateway,
} from './gateway.types.js'

/**
 * Lazily resolve a gateway's adapter. Factories are invoked once with the
 * singleton services and cached (promise-cached, so concurrent first
 * requests share one construction).
 */
const resolvedAdapters = new WeakMap<CoreGateway, Promise<GatewayAdapter>>()

/**
 * The generated function id a gateway's handler is registered under.
 */
const gatewayHandlerFuncId = (name: string) => `gateway__${name}__handler`

/**
 * Bridges a session established by gateway middleware onto the wire so the
 * handler's gate can see it.
 *
 * Gateway middleware is the only place a webhook can acquire a session (e.g.
 * mapping a verified platform sender to a user). Middleware that assigns
 * `wire.session` needs nothing, but middleware using the idiomatic
 * `wire.setSession()` writes to the enclosing wiring's session service, which
 * the handler's own invocation does not read — without this the session would
 * be silently invisible to `auth` and `scopes`.
 */
const bridgeMiddlewareSession = async (wire: PikkuRawWire): Promise<void> => {
  if (wire.session || !wire.getSession) return
  const session = await wire.getSession()
  if (session) {
    wire.session = session
  }
}

/**
 * Registers a gateway's handler as a real pikku function so that invoking it
 * goes through the function runner's gate. Without this the handler is called
 * directly and its own `auth`, `scopes` and `permissions` are never evaluated.
 *
 * The handler is registered as sessionless: a gateway's inbound traffic is
 * platform-authenticated (adapter signature verification), not session-bearing,
 * so requiring a session by default would break every webhook. A handler that
 * does need one declares `auth: true`, exactly like `pikkuSessionlessFunc`.
 * `scopes` and `permissions` are always enforced when declared.
 */
const registerGatewayHandler = (config: CoreGateway): string => {
  const funcId = gatewayHandlerFuncId(config.name)
  const funcMeta = pikkuState(null, 'function', 'meta')
  funcMeta[funcId] = {
    pikkuFuncId: funcId,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  }
  addFunction(funcId, config.func as any)
  return funcId
}

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
  const routes = pikkuState(null, 'http', 'routes')

  // --- POST handler (main message receiver) --------------------------------
  // Meta for these wrapper funcs/routes is compiled — the inspector projects
  // wireGateway into the generated HTTP + function meta; only the handler
  // implementations register here, same as every other wire.

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
  // Factory adapters can't be probed for verifyWebhook until first resolve,
  // so register the GET route unconditionally for them.

  if (typeof adapter === 'function' || adapter.verifyWebhook) {
    const verifyFuncId = `gateway__${name}__verify`

    const verifyHandler = {
      auth: false,
      func: createWebhookVerifyHandler(config),
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
      // challenge echo must be byte-identical — no JSON quoting
      returnsJSON: false,
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
 *  5. Invoke the handler through the function runner, which enforces its
 *     `auth`/`scopes`/`permissions` before running it
 *  6. Auto-send response via adapter if func returns outbound content
 */
const createWebhookPostHandler = (config: CoreGateway) => {
  const { name, middleware: userMiddleware } = config
  const handlerFuncId = registerGatewayHandler(config)

  return async (
    services: CoreSingletonServices,
    data: unknown,
    wire: PikkuWire
  ) => {
    const adapter = await resolveGatewayAdapter(config, services)

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

    // Gateway middleware runs first and outside the gate, so it can establish
    // the session the gate then checks. The handler is invoked through the
    // function runner, which enforces its auth, scopes and permissions and
    // applies the handler's own middleware.
    const invoke = async () => {
      await bridgeMiddlewareSession(wire as any)
      return await runPikkuFunc('gateway', name, handlerFuncId, {
        singletonServices: services,
        data: () => parsed,
        auth: config.auth,
        wire: wire as any,
      })
    }

    const gatewayMiddleware = userMiddleware as
      | CorePikkuMiddleware[]
      | undefined
    const result: any = gatewayMiddleware?.length
      ? await runMiddleware(services, wire, gatewayMiddleware, invoke)
      : await invoke()

    // Auto-send response if the func returns outbound content
    if (result && (result.text || result.richContent || result.attachments)) {
      await adapter.send(parsed.senderId, result as GatewayOutboundMessage)
    }
    return { ok: true }
  }
}

/**
 * Creates the GET handler for webhook verification challenges.
 * Passes query parameters to the adapter's verifyWebhook method.
 */
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
    // string challenges echo raw (byte-for-byte compare); objects stay JSON
    const response = result.response
    if (typeof response === 'string' || typeof response === 'number') {
      return String(response)
    }
    wire.http?.response?.header('content-type', 'application/json')
    return JSON.stringify(response)
  }
}

// ---------------------------------------------------------------------------
// WebSocket gateway — client connects via WebSocket
// ---------------------------------------------------------------------------

const wireWebsocketGateway = (config: CoreGateway): void => {
  const { name, route } = config
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

  const userMiddleware = config.middleware as CorePikkuMiddleware[] | undefined
  const handlerFuncId = registerGatewayHandler(config)

  // Register onConnect
  addFunction(connectFuncId, {
    auth: false,
    func: async (services: any, _data: unknown, wire: PikkuWire) => {
      const adapter = await resolveGatewayAdapter(config, services)
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
      ;(wire as any).gateway = gateway

      const invoke = async () => {
        await bridgeMiddlewareSession(wire as any)
        return await runPikkuFunc('gateway', name, handlerFuncId, {
          singletonServices: services,
          data: () => parsed,
          auth: config.auth,
          wire: wire as any,
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
  const userMiddleware = config.middleware as CorePikkuMiddleware[] | undefined
  const handlerFuncId = registerGatewayHandler(config)

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
    ;(wire as any).gateway = gateway

    const invoke = async () => {
      await bridgeMiddlewareSession(wire)
      return await runPikkuFunc('gateway', name, handlerFuncId, {
        singletonServices,
        data: () => parsed,
        auth: config.auth,
        wire,
      })
    }

    const result: any = userMiddleware?.length
      ? await runMiddleware(
          singletonServices,
          wire as any,
          userMiddleware,
          invoke
        )
      : await invoke()

    if (result && (result.text || result.richContent || result.attachments)) {
      await adapter.send(parsed.senderId, result as GatewayOutboundMessage)
    }
  }
}
