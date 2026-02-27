import { test, describe, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { PathToRegexRouter } from './path-to-regex.js'
import { resetPikkuState, pikkuState } from '../../../pikku-state.js'
import type { HTTPMethod } from '../http.types.js'

describe('PathToRegexRouter', () => {
  let router: PathToRegexRouter

  // Helper to create mock route wiring
  const mockRoute = (route: string) => ({
    route,
    method: 'get' as HTTPMethod,
    func: (() => {}) as any,
  })

  beforeEach(() => {
    resetPikkuState()
    router = new PathToRegexRouter()
  })

  describe('Static Route Optimization', () => {
    test('should correctly identify static routes', () => {
      // Setup test routes
      pikkuState(
        null,
        'http',
        'routes',
        new Map([
          [
            'get',
            new Map([
              ['/static', mockRoute('/static')],
              ['/api/about', mockRoute('/api/about')],
              ['/health', mockRoute('/health')],
            ]),
          ],
        ])
      )
      pikkuState(null, 'http', 'middleware', new Map())
      pikkuState(null, 'channel', 'channels', new Map())

      router.initialize()

      // Test static routes - should return exact matches with empty params
      const staticResult = router.match('get', '/static')
      assert.ok(staticResult, 'Static route should match')
      assert.strictEqual(staticResult.route, '/static')
      assert.deepStrictEqual(staticResult.params, {})

      const aboutResult = router.match('get', '/api/about')
      assert.ok(aboutResult, 'Static route /api/about should match')
      assert.strictEqual(aboutResult.route, '/api/about')
      assert.deepStrictEqual(aboutResult.params, {})
    })

    test('should handle dynamic routes with parameters', () => {
      // Setup test routes with parameters
      pikkuState(
        null,
        'http',
        'routes',
        new Map([
          [
            'get',
            new Map([
              ['/api/users/:id', mockRoute('/api/users/:id')],
              [
                '/posts/:slug/comments/:commentId',
                mockRoute('/posts/:slug/comments/:commentId'),
              ],
            ]),
          ],
        ])
      )
      pikkuState(null, 'http', 'middleware', new Map())
      pikkuState(null, 'channel', 'channels', new Map())

      router.initialize()

      // Test dynamic routes - should return matches with extracted parameters
      const userResult = router.match('get', '/api/users/123')
      assert.ok(userResult, 'Dynamic route should match')
      assert.strictEqual(userResult.route, '/api/users/:id')
      assert.strictEqual(userResult.params.id, '123')

      const commentResult = router.match(
        'get',
        '/posts/hello-world/comments/456'
      )
      assert.ok(commentResult, 'Complex dynamic route should match')
      assert.strictEqual(
        commentResult.route,
        '/posts/:slug/comments/:commentId'
      )
      assert.strictEqual(commentResult.params.slug, 'hello-world')
      assert.strictEqual(commentResult.params.commentId, '456')
    })

    test('should handle multi-parameter routes', () => {
      // Setup routes with multiple parameters
      pikkuState(
        null,
        'http',
        'routes',
        new Map([
          [
            'get',
            new Map([
              [
                '/api/:version/users/:userId',
                mockRoute('/api/:version/users/:userId'),
              ],
              [
                '/blog/:year/:month/:slug',
                mockRoute('/blog/:year/:month/:slug'),
              ],
            ]),
          ],
        ])
      )
      pikkuState(null, 'http', 'middleware', new Map())
      pikkuState(null, 'channel', 'channels', new Map())

      router.initialize()

      // Test multi-parameter routes
      const apiResult = router.match('get', '/api/v2/users/456')
      assert.ok(apiResult, 'Multi-parameter route should match')
      assert.strictEqual(apiResult.route, '/api/:version/users/:userId')
      assert.strictEqual(apiResult.params.version, 'v2')
      assert.strictEqual(apiResult.params.userId, '456')

      const blogResult = router.match('get', '/blog/2024/03/hello-world')
      assert.ok(blogResult, 'Deep multi-parameter route should match')
      assert.strictEqual(blogResult.route, '/blog/:year/:month/:slug')
      assert.strictEqual(blogResult.params.year, '2024')
      assert.strictEqual(blogResult.params.month, '03')
      assert.strictEqual(blogResult.params.slug, 'hello-world')
    })

    test('should prioritize static routes over dynamic routes for performance', () => {
      // Setup mixed routes where static could conflict with dynamic
      pikkuState(
        null,
        'http',
        'routes',
        new Map([
          [
            'get',
            new Map([
              ['/api/users', mockRoute('/api/users')], // static
              ['/api/:resource', mockRoute('/api/:resource')], // dynamic that could match above
            ]),
          ],
        ])
      )
      pikkuState(null, 'http', 'middleware', new Map())
      pikkuState(null, 'channel', 'channels', new Map())

      router.initialize()

      // Static route should be found first (O(1) lookup)
      const result = router.match('get', '/api/users')
      assert.ok(result, 'Route should match')
      assert.strictEqual(result.route, '/api/users') // Should match static, not dynamic
      assert.deepStrictEqual(result.params, {})
    })
  })

  describe('Path Normalization', () => {
    test('should normalize paths without leading slash', () => {
      pikkuState(
        null,
        'http',
        'routes',
        new Map([
          [
            'get',
            new Map([
              ['test', mockRoute('test')], // route without leading slash
              ['api/health', mockRoute('api/health')],
            ]),
          ],
        ])
      )
      pikkuState(null, 'http', 'middleware', new Map())
      pikkuState(null, 'channel', 'channels', new Map())

      router.initialize()

      // Should match with or without leading slash in request
      const result1 = router.match('get', '/test')
      assert.ok(result1, 'Should match /test')
      assert.strictEqual(result1.route, 'test')

      const result2 = router.match('get', 'test')
      assert.ok(result2, 'Should match test')
      assert.strictEqual(result2.route, 'test')

      const result3 = router.match('get', '/api/health')
      assert.ok(result3, 'Should match /api/health')
      assert.strictEqual(result3.route, 'api/health')
    })
  })

  describe('Channel Routes Integration', () => {
    test('should handle channel routes as GET routes', () => {
      pikkuState(null, 'http', 'routes', new Map())
      pikkuState(null, 'http', 'middleware', new Map())
      pikkuState(
        null,
        'channel',
        'channels',
        new Map([
          ['websocket-test', { name: 'websocket-test', route: '/ws/test' }],
          ['chat', { name: 'chat', route: '/chat/:room' }],
        ])
      )

      router.initialize()

      // Channel routes should be accessible via GET method
      const wsResult = router.match('get', '/ws/test')
      assert.ok(wsResult, 'Static channel route should match')
      assert.strictEqual(wsResult.route, '/ws/test')
      assert.deepStrictEqual(wsResult.params, {})

      const chatResult = router.match('get', '/chat/general')
      assert.ok(chatResult, 'Dynamic channel route should match')
      assert.strictEqual(chatResult.route, '/chat/:room')
      assert.strictEqual(chatResult.params.room, 'general')
    })
  })

  describe('Middleware Integration', () => {
    test('should match route without returning middleware', () => {
      const globalMiddleware = [async () => {}]
      const routeMiddleware = [async () => {}]

      pikkuState(
        null,
        'http',
        'routes',
        new Map([['get', new Map([['/api/test', mockRoute('/api/test')]])]])
      )
      pikkuState(
        null,
        'http',
        'middleware',
        new Map([
          ['*', globalMiddleware],
          ['/api/test', routeMiddleware],
        ])
      )
      pikkuState(null, 'channel', 'channels', new Map())

      router.initialize()

      const result = router.match('get', '/api/test')
      assert.ok(result, 'Route should match')
      // Router only returns route and params, middleware is handled separately
      assert.strictEqual(result.route, '/api/test')
      assert.deepStrictEqual(result.params, {})
    })
  })

  describe('No Match Scenarios', () => {
    test('should return null for non-existent routes', () => {
      pikkuState(
        null,
        'http',
        'routes',
        new Map([['get', new Map([['/existing', mockRoute('/existing')]])]])
      )
      pikkuState(null, 'http', 'middleware', new Map())
      pikkuState(null, 'channel', 'channels', new Map())

      router.initialize()

      const result = router.match('get', '/non-existent')
      assert.strictEqual(result, null)
    })

    test('should return null for unsupported HTTP methods', () => {
      pikkuState(
        null,
        'http',
        'routes',
        new Map([['get', new Map([['/test', mockRoute('/test')]])]])
      )
      pikkuState(null, 'http', 'middleware', new Map())
      pikkuState(null, 'channel', 'channels', new Map())

      router.initialize()

      const result = router.match('post', '/test')
      assert.strictEqual(result, null)
    })
  })

  describe('Lazy Initialization', () => {
    test('should initialize automatically on first match call', () => {
      pikkuState(
        null,
        'http',
        'routes',
        new Map([['get', new Map([['/test', mockRoute('/test')]])]])
      )
      pikkuState(null, 'http', 'middleware', new Map())
      pikkuState(null, 'channel', 'channels', new Map())

      // Don't call initialize manually
      const result = router.match('get', '/test')
      assert.ok(result, 'Should auto-initialize and match')
      assert.strictEqual(result.route, '/test')
    })
  })
})
