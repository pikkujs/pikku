import { authBearer } from '@pikku/core/middleware'
import { addHTTPMiddleware } from '../.pikku/pikku-types.gen.js'

/**
 * Register bearer token authentication middleware for all HTTP routes.
 * This middleware extracts JWT tokens from the Authorization header
 * and sets the session for authenticated routes.
 */
export const httpAuthMiddleware = () => addHTTPMiddleware('*', [authBearer({})])
