import { authBearer } from '@pikku/core/middleware'

/**
 * Bearer token authentication using JWT
 *
 * Expects: Authorization: Bearer <jwt-token>
 * The JWT is decoded using the JWT service to get the user session.
 *
 * Example usage:
 * ```typescript
 * import { bearerJWT } from './middleware'
 *
 * addHTTPMiddleware('*', [bearerJWT])
 * ```
 */
export const bearerJWT = authBearer()
