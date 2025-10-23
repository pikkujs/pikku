import { authAPIKey } from '@pikku/core/middleware'

/**
 * API key authentication using JWT
 *
 * The API key is expected to be a JWT token in the x-api-key header or apiKey query param.
 * The JWT is decoded using the JWT service to get the user session.
 *
 * Example usage:
 * ```typescript
 * import { apiKeyJWT } from './middleware'
 *
 * addHTTPMiddleware('*', [apiKeyJWT])
 * ```
 */
export const apiKeyJWT = authAPIKey({
  source: 'all', // Check both header and query parameter
})
