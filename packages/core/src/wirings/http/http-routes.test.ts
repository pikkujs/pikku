import { test, describe, beforeEach, afterEach } from 'node:test'
import * as assert from 'assert'
import { wireHTTPRoutes, defineRoutes } from './http-routes.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'
import { httpRouter } from './routers/http-router.js'
import { CorePikkuMiddleware } from '../../types/core.types.js'

// Mock function for testing
const mockFunc = async () => ({ success: true })

// Mock middleware
const mockMiddleware: CorePikkuMiddleware = async (_services, _wire, next) => {
  await next()
}

// Helper to set up function metadata for routes
const setupFunctionMeta = (
  routes: Array<{ method: string; route: string }>
) => {
  const meta: Record<string, Record<string, any>> = {
    get: {},
    post: {},
    delete: {},
    patch: {},
    head: {},
    put: {},
    options: {},
  }

  for (const { method, route } of routes) {
    meta[method][route] = {
      pikkuFuncName: `func_${route.replace(/[^a-z0-9]/gi, '_')}`,
      route,
      method,
    }
  }

  pikkuState(null, 'http', 'meta', meta)

  for (const { method, route } of routes) {
    const funcName = `func_${route.replace(/[^a-z0-9]/gi, '_')}`
    pikkuState(null, 'function', 'meta', {
      [funcName]: {
        pikkuFuncName: funcName,
        services: [],
      },
    } as any)
    addFunction(funcName, { func: mockFunc })
  }
}

describe('defineRoutes', () => {
  test('should accept routes directly', () => {
    const routes = defineRoutes({
      list: { method: 'get', route: '/todos', func: { func: mockFunc } },
      get: { method: 'get', route: '/todos/:id', func: { func: mockFunc } },
    })

    assert.ok(routes.routes.list)
    assert.ok(routes.routes.get)
    assert.strictEqual(routes.routes.list.method, 'get')
    assert.strictEqual(routes.routes.list.route, '/todos')
  })

  test('should accept config with routes', () => {
    const routes = defineRoutes({
      auth: true,
      tags: ['todos'],
      routes: {
        list: { method: 'get', route: '/todos', func: { func: mockFunc } },
      },
    })

    assert.strictEqual(routes.auth, true)
    assert.deepStrictEqual(routes.tags, ['todos'])
    assert.ok(routes.routes.list)
  })

  test('should handle basePath in config', () => {
    const routes = defineRoutes({
      basePath: '/api',
      routes: {
        list: { method: 'get', route: '/todos', func: { func: mockFunc } },
      },
    })

    assert.strictEqual(routes.basePath, '/api')
  })
})

describe('wireHTTPRoutes', () => {
  beforeEach(() => {
    resetPikkuState()
    httpRouter.reset()
  })

  afterEach(() => {
    resetPikkuState()
    httpRouter.reset()
  })

  test('should wire flat array of routes', () => {
    setupFunctionMeta([
      { method: 'get', route: '/todos' },
      { method: 'post', route: '/todos' },
    ])

    wireHTTPRoutes({
      routes: [
        { method: 'get', route: '/todos', func: { func: mockFunc } },
        { method: 'post', route: '/todos', func: { func: mockFunc } },
      ],
    })

    const routes = pikkuState(null, 'http', 'routes')
    assert.ok(routes.get('get')?.has('/todos'))
    assert.ok(routes.get('post')?.has('/todos'))
  })

  test('should wire nested object routes', () => {
    setupFunctionMeta([
      { method: 'get', route: '/todos' },
      { method: 'get', route: '/todos/:id' },
      { method: 'post', route: '/auth/login' },
    ])

    wireHTTPRoutes({
      routes: {
        todos: {
          list: { method: 'get', route: '/todos', func: { func: mockFunc } },
          get: {
            method: 'get',
            route: '/todos/:id',
            func: { func: mockFunc },
          },
        },
        auth: {
          login: {
            method: 'post',
            route: '/auth/login',
            func: { func: mockFunc },
          },
        },
      },
    })

    const routes = pikkuState(null, 'http', 'routes')
    assert.ok(routes.get('get')?.has('/todos'))
    assert.ok(routes.get('get')?.has('/todos/:id'))
    assert.ok(routes.get('post')?.has('/auth/login'))
  })

  test('should apply basePath to all routes', () => {
    setupFunctionMeta([
      { method: 'get', route: '/api/v1/todos' },
      { method: 'post', route: '/api/v1/todos' },
    ])

    wireHTTPRoutes({
      basePath: '/api/v1',
      routes: [
        { method: 'get', route: '/todos', func: { func: mockFunc } },
        { method: 'post', route: '/todos', func: { func: mockFunc } },
      ],
    })

    const routes = pikkuState(null, 'http', 'routes')
    assert.ok(routes.get('get')?.has('/api/v1/todos'))
    assert.ok(routes.get('post')?.has('/api/v1/todos'))
  })

  test('should merge tags from group config and route config', () => {
    setupFunctionMeta([{ method: 'get', route: '/todos' }])

    wireHTTPRoutes({
      tags: ['api'],
      routes: [
        {
          method: 'get',
          route: '/todos',
          func: { func: mockFunc },
          tags: ['todos'],
        },
      ],
    })

    const routes = pikkuState(null, 'http', 'routes')
    const route = routes.get('get')?.get('/todos')
    assert.deepStrictEqual(route?.tags, ['api', 'todos'])
  })

  test('should merge middleware from group config and route config', () => {
    setupFunctionMeta([{ method: 'get', route: '/todos' }])

    const groupMiddleware: CorePikkuMiddleware = async (_s, _w, next) => {
      await next()
    }
    const routeMiddleware: CorePikkuMiddleware = async (_s, _w, next) => {
      await next()
    }

    wireHTTPRoutes({
      middleware: [groupMiddleware],
      routes: [
        {
          method: 'get',
          route: '/todos',
          func: { func: mockFunc },
          middleware: [routeMiddleware],
        },
      ],
    })

    const routes = pikkuState(null, 'http', 'routes')
    const route = routes.get('get')?.get('/todos')
    assert.strictEqual(route?.middleware?.length, 2)
  })

  test('should allow route auth to override group auth', () => {
    setupFunctionMeta([
      { method: 'get', route: '/todos' },
      { method: 'post', route: '/auth/login' },
    ])

    wireHTTPRoutes({
      auth: true,
      routes: [
        { method: 'get', route: '/todos', func: { func: mockFunc } },
        {
          method: 'post',
          route: '/auth/login',
          func: { func: mockFunc },
          auth: false,
        },
      ],
    })

    const routes = pikkuState(null, 'http', 'routes')
    const todosRoute = routes.get('get')?.get('/todos')
    const loginRoute = routes.get('post')?.get('/auth/login')

    assert.strictEqual(todosRoute?.auth, true)
    assert.strictEqual(loginRoute?.auth, false)
  })

  test('should wire routes from defineRoutes contracts', () => {
    const todosRoutes = defineRoutes({
      tags: ['todos'],
      routes: {
        list: { method: 'get', route: '/todos', func: { func: mockFunc } },
      },
    })

    setupFunctionMeta([{ method: 'get', route: '/api/todos' }])

    wireHTTPRoutes({
      basePath: '/api',
      tags: ['api'],
      routes: {
        todos: todosRoutes,
      },
    })

    const routes = pikkuState(null, 'http', 'routes')
    const route = routes.get('get')?.get('/api/todos')
    assert.ok(route)
    assert.deepStrictEqual(route?.tags, ['api', 'todos'])
  })

  test('should cascade basePath from multiple levels', () => {
    const todosRoutes = defineRoutes({
      basePath: '/todos',
      routes: {
        list: { method: 'get', route: '', func: { func: mockFunc } },
        get: { method: 'get', route: '/:id', func: { func: mockFunc } },
      },
    })

    setupFunctionMeta([
      { method: 'get', route: '/api/v1/todos' },
      { method: 'get', route: '/api/v1/todos/:id' },
    ])

    wireHTTPRoutes({
      basePath: '/api/v1',
      routes: {
        todos: todosRoutes,
      },
    })

    const routes = pikkuState(null, 'http', 'routes')
    assert.ok(routes.get('get')?.has('/api/v1/todos'))
    assert.ok(routes.get('get')?.has('/api/v1/todos/:id'))
  })

  test('should handle deeply nested route maps', () => {
    setupFunctionMeta([
      { method: 'get', route: '/todos' },
      { method: 'get', route: '/todos/:id' },
    ])

    wireHTTPRoutes({
      routes: {
        level1: {
          level2: {
            list: { method: 'get', route: '/todos', func: { func: mockFunc } },
            get: {
              method: 'get',
              route: '/todos/:id',
              func: { func: mockFunc },
            },
          },
        },
      },
    })

    const routes = pikkuState(null, 'http', 'routes')
    assert.ok(routes.get('get')?.has('/todos'))
    assert.ok(routes.get('get')?.has('/todos/:id'))
  })
})
