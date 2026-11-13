import { fetch } from '@pikku/core/http'
import type { CorePikkuMiddleware } from '@pikku/core/middleware'
import { addFunction } from '@pikku/core/function'
import { wireHTTP } from '@pikku/core/http'
import { httpRouter } from '@pikku/core/http'
import { pikkuState, resetPikkuState } from '@pikku/core/state'

export const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

export type BenchmarkSetupOptions = {
  /** Replaces the default `{ logger: noopLogger }` singleton services (the telemetry bench injects a tracer and an OTLP logger). */
  singletonServices?: Record<string, unknown>
  /** Each function writes one `services.logger.info` line, so a request has a log record to export. */
  logPerRequest?: boolean
}

let userCounter = 0

export const distinctUsers = (on: boolean) => {
  userCounter = on ? 1 : 0
}

const sessionMiddleware: CorePikkuMiddleware = async (
  _services,
  wire,
  next
) => {
  const userId = userCounter > 0 ? `user-${userCounter++}` : 'bench-user'
  await wire.setSession?.({ userId } as any)
  await next()
}

const alwaysAllowPermission = async () => true

let logPerRequest = false

const logLine = (services: any) => {
  if (logPerRequest) services.logger.info('request handled')
}

const bareFunc = async (services: any) => {
  logLine(services)
  return { ok: true }
}
const schemaFunc = async (services: any, data: any) => {
  logLine(services)
  return { echo: data.name }
}
const middlewareFunc = async (services: any) => {
  logLine(services)
  return { ok: true }
}
const fullFunc = async (services: any, data: any) => {
  logLine(services)
  return { echo: data.name }
}
const paramFunc = async (services: any, data: any) => {
  logLine(services)
  return { id: data.id }
}

export type Scenario = {
  name: string
  method: 'get' | 'post'
  route: string
  url: string
  body?: string
  contentType?: string
}

export const scenarios: Scenario[] = [
  { name: 'bare', method: 'get', route: 'bare', url: '/bare' },
  {
    name: 'schema',
    method: 'post',
    route: 'schema',
    url: '/schema',
    body: JSON.stringify({ name: 'bench' }),
    contentType: 'application/json',
  },
  {
    name: 'middleware',
    method: 'get',
    route: 'middleware',
    url: '/middleware',
  },
  {
    name: 'full',
    method: 'post',
    route: 'full',
    url: '/full',
    body: JSON.stringify({ name: 'bench' }),
    contentType: 'application/json',
  },
  { name: 'param', method: 'get', route: 'items/:id', url: '/items/42' },
]

export function setupBenchmarkRoutes(options: BenchmarkSetupOptions = {}) {
  resetPikkuState()
  httpRouter.reset()
  logPerRequest = options.logPerRequest === true

  pikkuState(
    null,
    'package',
    'singletonServices',
    (options.singletonServices ?? {
      logger: noopLogger,
    }) as any
  )
  pikkuState(null, 'package', 'factories', {
    createWireServices: async () => ({}),
  } as any)

  const httpMeta: Record<string, Record<string, any>> = {
    get: {
      bare: { pikkuFuncId: 'bare', route: 'bare', method: 'get' },
      middleware: {
        pikkuFuncId: 'middleware',
        route: 'middleware',
        method: 'get',
      },
      'items/:id': {
        pikkuFuncId: 'param',
        route: 'items/:id',
        method: 'get',
        params: ['id'],
      },
    },
    post: {
      schema: { pikkuFuncId: 'schema', route: 'schema', method: 'post' },
      full: { pikkuFuncId: 'full', route: 'full', method: 'post' },
    },
    delete: {},
    patch: {},
    head: {},
    put: {},
    options: {},
  }

  const functionMeta: Record<string, any> = {
    bare: { pikkuFuncId: 'bare', services: [], sessionless: true },
    schema: { pikkuFuncId: 'schema', services: [], sessionless: true },
    middleware: { pikkuFuncId: 'middleware', services: ['userSession'] },
    full: { pikkuFuncId: 'full', services: ['userSession'] },
    param: { pikkuFuncId: 'param', services: [], sessionless: true },
  }

  pikkuState(null, 'function', 'meta', functionMeta as any)
  pikkuState(null, 'http', 'meta', httpMeta as any)

  addFunction('bare', { func: bareFunc })
  addFunction('schema', { func: schemaFunc })
  addFunction('middleware', { func: middlewareFunc })
  addFunction('full', { func: fullFunc })
  addFunction('param', { func: paramFunc })

  wireHTTP({
    route: 'bare',
    method: 'get',
    func: { func: bareFunc },
    auth: false,
  })

  wireHTTP({
    route: 'schema',
    method: 'post',
    func: { func: schemaFunc },
    auth: false,
  })

  wireHTTP({
    route: 'middleware',
    method: 'get',
    func: { func: middlewareFunc, middleware: [sessionMiddleware] },
  })

  wireHTTP({
    route: 'full',
    method: 'post',
    func: {
      func: fullFunc,
      middleware: [sessionMiddleware, sessionMiddleware],
      permissions: { canAccess: alwaysAllowPermission },
    },
  })

  wireHTTP({
    route: 'items/:id',
    method: 'get',
    func: { func: paramFunc },
    auth: false,
  })

  httpRouter.initialize()
}

export function createRequest(scenario: Scenario): Request {
  const url = `http://localhost${scenario.url}`
  const init: RequestInit = { method: scenario.method.toUpperCase() }
  if (scenario.body) {
    init.body = scenario.body
    init.headers = {
      'content-type': scenario.contentType || 'application/json',
    }
  }
  return new Request(url, init)
}

export { fetch }
