import { fetch, addFunction, type CorePikkuMiddleware } from '@pikku/core'
import { wireHTTP } from '@pikku/core/http'
import { pikkuState, resetPikkuState, httpRouter } from '@pikku/core/internal'

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

const sessionMiddleware: CorePikkuMiddleware = async (
  _services,
  wire,
  next
) => {
  wire.setSession?.({ userId: 'bench-user' } as any)
  await next()
}

const alwaysAllowPermission = async () => true

const bareFunc = async () => ({ ok: true })
const schemaFunc = async (_services: any, data: any) => ({ echo: data.name })
const middlewareFunc = async () => ({ ok: true })
const fullFunc = async (_services: any, data: any) => ({ echo: data.name })
const paramFunc = async (_services: any, data: any) => ({ id: data.id })

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

export function setupBenchmarkRoutes() {
  resetPikkuState()
  httpRouter.reset()

  pikkuState(null, 'package', 'singletonServices', {
    logger: noopLogger,
  } as any)
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
    bare: { pikkuFuncId: 'bare', services: [] },
    schema: { pikkuFuncId: 'schema', services: [] },
    middleware: { pikkuFuncId: 'middleware', services: ['userSession'] },
    full: { pikkuFuncId: 'full', services: ['userSession'] },
    param: { pikkuFuncId: 'param', services: [] },
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
    auth: false,
  })

  wireHTTP({
    route: 'full',
    method: 'post',
    func: {
      func: fullFunc,
      middleware: [sessionMiddleware, sessionMiddleware],
      permissions: { canAccess: alwaysAllowPermission },
    },
    auth: false,
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
