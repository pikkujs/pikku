import { authBearer } from '@pikku/core/middleware'
import { addHTTPMiddleware } from './pikku-types.gen.js'

/**
 * Bearer token authentication using JWT
 *
 * Expects: Authorization: Bearer <jwt-token>
 * The JWT is decoded using the JWT service to get the user session.
 */
export const bearerJWT = authBearer({
  jwt: true,
})

// Apply to all routes
addHTTPMiddleware([bearerJWT])
