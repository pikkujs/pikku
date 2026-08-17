import { test, describe, beforeEach } from 'node:test'
import * as assert from 'assert'
import { fetch, wireHTTP } from './http-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
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

const registerAddon = (sessionless = true) => {
  pikkuState(null, 'addons', 'packages').set(ADDON_NAMESPACE, {
    package: ADDON_PACKAGE,
  } as never)
  pikkuState(ADDON_PACKAGE, 'function', 'meta', {
    greet: {
      pikkuFuncId: 'greet',
      name: 'greet',
      sessionless,
      inputSchemaName: null,
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
    packageName: ADDON_PACKAGE,
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

    assert.strictEqual(response.status, 403)
  })
})
