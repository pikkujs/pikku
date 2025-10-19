import { wireHTTP, addHTTPMiddleware } from './pikku-types.gen.js'
import { login, updateProfile } from './functions/auth.function.js'
import { persistSession, auditLog, rateLimit } from './middleware.js'

/**
 * Global HTTP middleware - applies to all HTTP routes
 */
addHTTPMiddleware([auditLog])

/**
 * Prefix-scoped HTTP middleware - applies to all /admin routes
 */
addHTTPMiddleware('/admin', [rateLimit({ maxRequests: 10, windowMs: 60000 })])

/**
 * Route with per-route middleware
 * POST /v1/login
 * The persistSession middleware runs after the function to set cookies
 */
wireHTTP({
  method: 'post',
  route: '/v1/login',
  func: login,
  middleware: [persistSession], // Transport-specific middleware
})

/**
 * Route inheriting global and prefix middleware
 * PATCH /admin/profile
 */
wireHTTP({
  method: 'patch',
  route: '/admin/profile',
  func: updateProfile,
  // Inherits: auditLog (global) + rateLimit (from /admin prefix)
})
