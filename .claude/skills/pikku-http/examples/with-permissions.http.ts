import { wireHTTP, addHTTPPermission } from './pikku-types.gen.js'
import {
  updateCard,
  deleteCard,
  adminDashboard,
} from './functions/board.function.js'
import { requireOwner, requireAdmin, requireAuth } from './permissions.js'

/**
 * Global HTTP permissions - applies to all HTTP routes
 * Use '*' for global permissions
 */
addHTTPPermission('*', {
  auth: requireAuth,
})

/**
 * Prefix-scoped HTTP permissions - applies to all /admin routes
 */
addHTTPPermission('/admin', {
  admin: requireAdmin,
})

/**
 * Route with per-route permissions
 * PATCH /v1/cards/:cardId
 */
wireHTTP({
  method: 'patch',
  route: '/v1/cards/:cardId',
  func: updateCard,
  permissions: [requireOwner], // Transport-specific permission override
})

/**
 * Route with multiple permissions
 * DELETE /v1/cards/:cardId
 */
wireHTTP({
  method: 'delete',
  route: '/v1/cards/:cardId',
  func: deleteCard,
  permissions: [requireOwner, requireAdmin], // Both permissions must pass
})

/**
 * Admin route inheriting prefix permissions
 * GET /admin/dashboard
 */
wireHTTP({
  method: 'get',
  route: '/admin/dashboard',
  func: adminDashboard,
  // Inherits: requireAuth (global from '*') + requireAdmin (from /admin prefix)
})
