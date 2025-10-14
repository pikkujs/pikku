import { test, describe, beforeEach, afterEach } from 'node:test'
import * as assert from 'assert'
import { NotFoundError } from '../../errors/errors.js'
import { JSONValue, CorePikkuMiddleware } from '../../types/core.types.js'
import { fetch, wireHTTP } from './http-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  PikkuMockRequest,
  PikkuMockResponse,
} from '../channel/local/local-channel-runner.test.js'
import { addFunction } from '../../function/function-runner.js'
import { httpRouter } from './routers/http-router.js'

const sessionMiddleware: CorePikkuMiddleware = async (services, _, next) => {
  services.userSession.set({ userId: 'test' } as any)
  await next()
}

const setHTTPFunctionMap = (func: any) => {
  pikkuState('function', 'meta', {
    pikku_func_name: {
      pikkuFuncName: 'pikku_func_name',
      services: ['userSession'],
    },
  } as any)
  pikkuState('http', 'meta', {
    get: {
      test: {
        pikkuFuncName: 'pikku_func_name',
        route: 'test',
        method: 'get',
      },
    },
    post: {},
    delete: {},
    patch: {},
    head: {},
    put: {},
    options: {},
  })
  addFunction('pikku_func_name', { func })
}

describe('fetch', () => {
  let singletonServices: any
  let createSessionServices: any
  let request: any
  let response: any

  beforeEach(() => {
    resetPikkuState()
    httpRouter.reset()

    singletonServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    }

    createSessionServices = async () => ({})
    request = new PikkuMockRequest('/test', 'get')
    response = new PikkuMockResponse()

    request.getData = async () => ({})
    request.getHeader = (name: string) =>
      name === 'content-type' ? 'application/json' : undefined
    response.setStatus = (status: number) => {}
    response.setJson = (json: JSONValue) => {}
  })

  afterEach(() => {})

  test('should throw RouteNotFoundError when no matching route is found', async () => {
    await assert.rejects(
      async () =>
        fetch(request, {
          singletonServices,
          createSessionServices,
          bubbleErrors: true,
        }),
      NotFoundError
    )
  })

  test('should call the route function and return its result when a matching route is found', async () => {
    const routeFunc = async () => ({ success: true })
    setHTTPFunctionMap(routeFunc)

    wireHTTP({
      route: 'test',
      method: 'get',
      func: { func: routeFunc, middleware: [sessionMiddleware] },
    })

    // Initialize router after adding route (for tests)
    httpRouter.initialize()

    const result = await fetch(request, {
      singletonServices,
      createSessionServices,
    })

    assert.deepStrictEqual(await result.json(), { success: true })
  })

  test('should verify permissions if provided', async () => {
    const permissions = { test: async () => true }
    const routeFunc = async () => ({ success: true })
    setHTTPFunctionMap(routeFunc)

    wireHTTP({
      route: 'test',
      method: 'get',
      func: {
        func: routeFunc,
        permissions,
        middleware: [sessionMiddleware],
      },
    })

    await fetch(request, {
      singletonServices,
      createSessionServices,
    })

    assert.strictEqual(await permissions.test(), true)
  })

  test('should handle errors and set appropriate response', async () => {
    const error = new Error('Test error')
    const routeFunc = async () => {
      throw error
    }
    setHTTPFunctionMap(routeFunc)
    wireHTTP({
      route: 'test',
      method: 'get',
      func: { func: routeFunc, middleware: [sessionMiddleware] },
    })
    await assert.rejects(
      async () =>
        fetch(request, {
          singletonServices,
          createSessionServices,
          bubbleErrors: true,
        }),
      error
    )
  })
})
