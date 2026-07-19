// Ensure HTTP metadata is loaded before calling wireHTTP
import '../../.pikku/http/pikku-http-wirings-meta.gen.js'

import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'
import {
  addHTTPMiddleware,
  addTagMiddleware,
  pikkuMiddleware,
  wireHTTP,
} from '#pikku'
import { wireHTTPRoutes, defineHTTPRoutes } from '@pikku/core/http'
import {
  httpGlobalMiddleware,
  httpRouteMiddleware,
} from '../middleware/http.js'
import { tagMiddleware } from '../middleware/tag.js'

// Global tag middleware - Recommended: Use factory pattern for tree-shaking
export const apiTagMiddleware = () =>
  addTagMiddleware('api', [tagMiddleware('api')])

// Session tag middleware - applies to all wirings with 'session' tag
export { sessionTagMiddleware } from '../middleware/fake-session.js'

// HTTP-specific global middleware - Also works: Direct call (no tree-shaking)
export const httpMiddleware = () =>
  addHTTPMiddleware('*', [httpGlobalMiddleware])

// Route-pattern middleware - Recommended: Use factory pattern
export const apiRouteMiddleware = () =>
  addHTTPMiddleware('/api/*', [httpRouteMiddleware])

// Wire-level inline middleware (not exported, won't be in pikku-middleware.gen.ts)
const inlineWireMiddleware = pikkuMiddleware(async ({ logger }, _, next) => {
  logger.info({ type: 'wire', name: 'inline', phase: 'before' })
  const result = await next()
  logger.info({ type: 'wire', name: 'inline', phase: 'after' })
  return result
})

// HTTP endpoint with:
// - Global tag middleware (api)
// - HTTP-specific middleware (*)
// - Route pattern middleware (/api/*)
// - Wire-level middleware (exported + inline)
// - Function-level middleware + permissions (on noOpFunction)
wireHTTP({
  method: 'get',
  route: '/api/test',
  tags: ['session', 'api'],
  middleware: [wireMiddleware('api-test'), inlineWireMiddleware],
  func: noOpFunction,
  auth: true, // Session set by sessionTagMiddleware
})

// HTTP endpoint with an organizational-only tag
wireHTTP({
  method: 'post',
  route: '/api/admin',
  tags: ['session', 'admin'],
  func: noOpFunction,
  auth: false, // No authentication required for this example
})

// HTTP endpoint with only function-level middleware + permissions to test isolation
wireHTTP({
  method: 'get',
  route: '/simple',
  tags: ['session'],
  func: noOpFunction,
  auth: false, // No authentication required for this example
})

// HTTP endpoint to test middleware priority ordering
// Middleware registered in wrong order should still execute in priority order
import { priorityMiddleware } from '../middleware/priority.js'

wireHTTP({
  method: 'get',
  route: '/priority-test',
  middleware: [
    priorityMiddleware('lowest', 'lowest'),
    priorityMiddleware('medium', 'medium'),
    priorityMiddleware('highest', 'highest'),
    priorityMiddleware('low', 'low'),
    priorityMiddleware('high', 'high'),
  ],
  func: noOpFunction,
  auth: false,
})

// ==========================================
// wireHTTPRoutes - Grouped Route Wiring
// ==========================================

// Define a route contract with group-level config
// Note: Using 'as any' because the verifier's generated types differ from core types
const groupedRoutes = defineHTTPRoutes({
  tags: ['api'], // Group-level tags cascade to all routes
  routes: {
    grouped: {
      method: 'get',
      route: '/grouped',
      func: noOpFunction as any,
      tags: ['session'], // Route-level tags merge with group tags
    },
  },
})

// Wire routes with basePath - tests cascading behavior
wireHTTPRoutes({
  basePath: '/api/v1',
  tags: ['session'], // Top-level tags cascade to nested routes
  middleware: [wireMiddleware('grouped-api') as any], // Group middleware runs first
  routes: {
    // Direct route - inherits group config
    direct: {
      method: 'get',
      route: '/direct',
      func: noOpFunction as any,
      middleware: [inlineWireMiddleware as any], // Route middleware runs after group
      auth: true,
    },
    // Nested contract - merges configs
    todos: groupedRoutes,
  },
})
