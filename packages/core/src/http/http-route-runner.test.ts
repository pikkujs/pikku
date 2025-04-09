import { test, describe, beforeEach, afterEach } from 'node:test'
import * as assert from 'assert'
import { NotFoundError } from '../errors/errors.js'
import { JSONValue, PikkuMiddleware } from '../types/core.types.js'
import { fetch, addRoute } from './http-route-runner.js'
import { resetPikkuState } from '../pikku-state.js'
import {
  PikkuMockRequest,
  PikkuMockResponse,
} from '../channel/local/local-channel-runner.test.js'

const sessionMiddleware: PikkuMiddleware = async (services, _, next) => {
  services.userSession.set({ userId: 'test' } as any)
  await next()
}

describe('fetch', () => {
  let singletonServices: any
  let createSessionServices: any
  let request: any
  let response: any

  beforeEach(() => {
    resetPikkuState()

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
    request.getHeader = () => 'application/json'
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
    addRoute({
      route: 'test',
      method: 'get',
      func: routeFunc,
      middleware: [sessionMiddleware],
    })

    const result = await fetch(request, {
      singletonServices,
      createSessionServices,
    })

    assert.deepStrictEqual(await result.json(), { success: true })
  })

  test('should verify permissions if provided', async () => {
    const permissions = { test: async () => true }
    const routeFunc = async () => ({ success: true })

    addRoute({
      route: 'test',
      method: 'get',
      func: routeFunc,
      permissions,
      middleware: [sessionMiddleware],
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
    addRoute({
      route: 'test',
      method: 'get',
      func: routeFunc,
      middleware: [sessionMiddleware],
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
