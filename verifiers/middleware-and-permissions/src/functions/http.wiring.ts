// Ensure HTTP metadata is loaded before calling wireHTTP
import '../../.pikku/http/pikku-http-wirings-meta.gen.js'

import { wireMiddleware } from '../middleware/wire.js'
import { wirePermission } from '../permissions/wire.js'
import { noOpFunction } from './no-op.function.js'
import {
  addHTTPMiddleware,
  addHTTPPermission,
  addMiddleware,
  addPermission,
  pikkuMiddleware,
  pikkuPermission,
  wireHTTP,
} from '../../.pikku/pikku-types.gen.js'
import {
  httpGlobalMiddleware,
  httpRouteMiddleware,
} from '../middleware/http.js'
import {
  httpGlobalPermission,
  httpRoutePermission,
} from '../permissions/http.js'
import { permissionTagFactory, readTagPermission } from '../permissions/tag.js'

// Global tag middleware - Recommended: Use factory pattern for tree-shaking
export const apiTagMiddleware = () =>
  addMiddleware('api', [httpRouteMiddleware])

// Global tag permissions - Recommended: Use factory pattern for tree-shaking
export const apiTagPermissions = () =>
  addPermission('api', { read: readTagPermission })

export const adminTagPermissions = () =>
  addPermission('admin', { admin: permissionTagFactory('admin') })

// HTTP-specific global middleware - Also works: Direct call (no tree-shaking)
export const httpMiddleware = addHTTPMiddleware('*', [httpGlobalMiddleware])

// HTTP-specific global permissions - Also works: Direct call (no tree-shaking)
export const httpPermissions = addHTTPPermission('*', {
  global: httpGlobalPermission,
})

// Route-pattern middleware - Recommended: Use factory pattern
export const apiRouteMiddleware = () =>
  addHTTPMiddleware('/api/*', [httpRouteMiddleware])

// Route-pattern permissions - Recommended: Use factory pattern
export const apiRoutePermissions = () =>
  addHTTPPermission('/api/*', { route: httpRoutePermission })

// Wire-level inline middleware (not exported, won't be in pikku-middleware.gen.ts)
const inlineWireMiddleware = pikkuMiddleware(
  async ({ logger }, _interaction, next) => {
    logger.info({ type: 'wire', name: 'inline', phase: 'before' })
    const result = await next()
    logger.info({ type: 'wire', name: 'inline', phase: 'after' })
    return result
  }
)

// Wire-level inline permission (not exported, won't be in pikku-permissions.gen.ts)
const inlineWirePermission = pikkuPermission(
  async ({ logger }, _data, session) => {
    logger.info({
      type: 'wire-permission',
      name: 'inline',
      sessionExists: !!session,
    })
    // Return false to ensure all permissions run
    return false
  }
)

// HTTP endpoint with:
// - Global tag middleware + permissions (api)
// - HTTP-specific middleware + permissions (*)
// - Route pattern middleware + permissions (/api/*)
// - Wire-level middleware + permissions (exported + inline)
// - Function-level middleware + permissions
wireHTTP({
  method: 'get',
  route: '/api/test',
  tags: ['api'],
  middleware: [wireMiddleware('api-test'), inlineWireMiddleware],
  permissions: {
    wire: [wirePermission, inlineWirePermission],
  },
  func: noOpFunction,
  auth: true, // Auth required when permissions are present
})

// HTTP endpoint with admin tag permissions
wireHTTP({
  method: 'post',
  route: '/api/admin',
  tags: ['admin'],
  func: noOpFunction,
  auth: false, // No authentication required for this example
})

// HTTP endpoint with only function-level middleware + permissions to test isolation
wireHTTP({
  method: 'get',
  route: '/simple',
  func: noOpFunction,
  auth: false, // No authentication required for this example
})
