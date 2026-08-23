import { test, describe, beforeEach } from 'node:test'
import * as assert from 'assert'
import { addHTTPMiddleware, fetch, wireHTTP } from './http-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addSchema } from '../../schema.js'
import { PikkuMockRequest } from '../channel/local/local-channel-runner.test.js'
import { httpRouter } from './routers/http-router.js'
import type { CoreHTTPFunctionWiring, HTTPMethod } from './http.types.js'

const ADDON_PACKAGE = '@acme/addon'
const ADDON_NAMESPACE = 'ext'
const TARGET = `${ADDON_NAMESPACE}:greet`

class ParamsRequest extends PikkuMockRequest {
  override async data() {
    return this.params()
  }
  override header(): string | null {
    return null
  }
}

const registerAddon = (
  sessionless = true,
  inputSchemaName: string | null = null
) => {
  pikkuState(null, 'addons', 'packages').set(ADDON_NAMESPACE, {
    package: ADDON_PACKAGE,
  } as never)
  pikkuState(ADDON_PACKAGE, 'function', 'meta', {
    greet: {
      pikkuFuncId: 'greet',
      name: 'greet',
      sessionless,
      inputSchemaName,
      outputSchemaName: null,
      inputs: [],
      outputs: [],
      services: { optimized: false, services: [] },
    },
  } as never)
}

const emptyHTTPMeta = () => ({
  get: {},
  post: {},
  delete: {},
  patch: {},
  head: {},
  put: {},
  options: {},
})

const setRouteMeta = (
  route: string,
  method: HTTPMethod,
  extra: Record<string, unknown> = {}
) => {
  const meta = pikkuState(null, 'http', 'meta')
  meta[method][route] = {
    pikkuFuncId: TARGET,
    route,
    method,
    ...extra,
  }
}

describe('http routes wired with ref() to an addon function', () => {
  beforeEach(() => {
    resetPikkuState()
    httpRouter.reset()
    pikkuState(null, 'package', 'singletonServices', {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    } as never)
    pikkuState(null, 'package', 'factories', {
      createWireServices: async () => ({}),
    } as never)
    pikkuState(null, 'http', 'meta', emptyHTTPMeta() as never)
  })

  test('resolves the namespaced target through the addon package', async () => {
    registerAddon()
    setRouteMeta('/addon/greet', 'get', { auth: false })

    wireHTTP({
      route: '/addon/greet',
      method: 'get',
      auth: false,
      func: { func: async () => ({ message: 'hello' }) },
    } as CoreHTTPFunctionWiring<unknown, unknown, string>)
    httpRouter.initialize()

    const response = await fetch(new ParamsRequest('/addon/greet', 'get'))

    assert.strictEqual(response.status, 200)
    assert.deepStrictEqual(await response.json(), { message: 'hello' })
  })

  test('serves the same addon function at two routes with different params', async () => {
    registerAddon()
    setRouteMeta('/addon/greet/:id', 'get', { auth: false, params: ['id'] })
    setRouteMeta('/addon/greet-all', 'get', { auth: false })

    const seen: unknown[] = []
    const proxy = {
      func: async (_services: never, data: unknown) => {
        seen.push(data)
        return data
      },
    }

    wireHTTP({
      route: '/addon/greet/:id',
      method: 'get',
      auth: false,
      func: proxy,
    } as unknown as CoreHTTPFunctionWiring<unknown, unknown, string>)
    wireHTTP({
      route: '/addon/greet-all',
      method: 'get',
      auth: false,
      func: proxy,
    } as unknown as CoreHTTPFunctionWiring<unknown, unknown, string>)
    httpRouter.initialize()

    const withParam = await fetch(new ParamsRequest('/addon/greet/42', 'get'))
    const withoutParam = await fetch(
      new ParamsRequest('/addon/greet-all', 'get')
    )

    assert.deepStrictEqual(await withParam.json(), { id: '42' })
    assert.deepStrictEqual(await withoutParam.json(), {})
    assert.deepEqual(seen, [{ id: '42' }, {}])
  })

  /**
   * The addon registers its schemas in its own package state, and the name the
   * runner validates against comes from the addon's metadata. Resolving the
   * target's metadata by namespace while still reading the schema registry of
   * the wire's package looks the name up under 'main', where the addon never
   * put it — the route then answers 500 for every input it was given.
   */
  test("validates input against the addon package's schema registry", async () => {
    registerAddon(true, 'GreetInput')
    addSchema(
      'GreetInput',
      { type: 'object', properties: { id: { type: 'string' } } },
      ADDON_PACKAGE
    )
    setRouteMeta('/addon/greet-schema/:id', 'get', {
      auth: false,
      params: ['id'],
    })

    const compiled: string[] = []
    pikkuState(null, 'package', 'singletonServices', {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      schema: {
        compileSchema: (key: string) => {
          compiled.push(key)
        },
        validateSchema: () => {},
        getSchemaKeys: () => [],
      },
    } as never)

    wireHTTP({
      route: '/addon/greet-schema/:id',
      method: 'get',
      auth: false,
      func: { func: async (_s: never, data: unknown) => data },
    } as unknown as CoreHTTPFunctionWiring<unknown, unknown, string>)
    httpRouter.initialize()

    const response = await fetch(
      new ParamsRequest('/addon/greet-schema/42', 'get')
    )

    assert.strictEqual(response.status, 200)
    assert.deepStrictEqual(await response.json(), { id: '42' })
    assert.deepStrictEqual(compiled.length > 0, true)
  })

  test("runs the consuming app's middleware, not the addon package's", async () => {
    registerAddon()
    setRouteMeta('/addon/greet-mw', 'get', {
      auth: false,
      middleware: [{ type: 'http', route: '*' }],
    })

    const ran: string[] = []
    addHTTPMiddleware('*', [
      async (_services, _wire, next) => {
        ran.push('app')
        await next()
      },
    ] as never)
    addHTTPMiddleware(
      '*',
      [
        async (_services: never, _wire: never, next: () => Promise<void>) => {
          ran.push('addon')
          await next()
        },
      ] as never,
      ADDON_PACKAGE
    )

    wireHTTP({
      route: '/addon/greet-mw',
      method: 'get',
      auth: false,
      func: { func: async () => ({ message: 'hello' }) },
    } as CoreHTTPFunctionWiring<unknown, unknown, string>)
    httpRouter.initialize()

    const response = await fetch(new ParamsRequest('/addon/greet-mw', 'get'))

    assert.strictEqual(response.status, 200)
    assert.deepStrictEqual(ran, ['app'])
  })

  test('honours the addon function metadata when a session is required', async () => {
    registerAddon(false)
    setRouteMeta('/addon/greet', 'get')

    wireHTTP({
      route: '/addon/greet',
      method: 'get',
      func: { func: async () => ({ message: 'hello' }) },
    } as CoreHTTPFunctionWiring<unknown, unknown, string>)
    httpRouter.initialize()

    const response = await fetch(new ParamsRequest('/addon/greet', 'get'))

    assert.strictEqual(response.status, 401)
  })
})
