import { authAPIKey } from '@pikku/core/middleware'
import { addHTTPMiddleware } from './pikku-types.gen.js'

/**
 * API key authentication using JWT
 *
 * The API key is expected to be a JWT token in the x-api-key header or apiKey query param.
 * The JWT is decoded using the JWT service to get the user session.
 */
export const apiKeyJWT = authAPIKey({
  source: 'all', // Check both header and query parameter
  jwt: true, // Decode API key as JWT token
})

// Apply to all API routes
addHTTPMiddleware('/api', [apiKeyJWT])
