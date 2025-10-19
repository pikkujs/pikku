import { authAPIKey, authBearer, authCookie } from '@pikku/core/middleware'
import { addHTTPMiddleware } from './pikku-types.gen.js'

/**
 * Combining multiple authentication methods
 *
 * Middleware runs in order. Each skips if session already exists.
 * This allows fallback authentication strategies.
 */

const bearerJWT = authBearer({ jwt: true })

const cookieJWT = authCookie({
  name: 'session',
  jwt: true,
  expiresIn: { value: 7, unit: 'day' },
  options: {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  },
})

const apiKeyJWT = authAPIKey({
  source: 'all',
  jwt: true,
})

// Try Bearer token, then cookie, then API key
addHTTPMiddleware([bearerJWT, cookieJWT, apiKeyJWT])
