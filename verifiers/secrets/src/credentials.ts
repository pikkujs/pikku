import { z } from 'zod'
import { wireSecret } from '@pikku/core/secret'
import { wireOAuth2Credential } from '@pikku/core/oauth2'

/**
 * Example API credentials using wireSecret with Zod schema.
 * Tests type inference for regular secrets.
 */
export const apiCredentialsSchema = z.object({
  apiKey: z.string().describe('API key for authentication'),
  apiSecret: z.string().describe('API secret for signing requests'),
  baseUrl: z.url().optional().describe('Optional custom API endpoint'),
})

wireSecret({
  name: 'example-api',
  displayName: 'Example API',
  description: 'Credentials for the example external API',
  secretId: 'EXAMPLE_API_CREDENTIALS',
  schema: apiCredentialsSchema,
})

/**
 * Mock OAuth2 credential for testing OAuth flows.
 * Uses oauth2-mock-server running on localhost:8080
 */
wireOAuth2Credential({
  name: 'mock',
  displayName: 'Mock OAuth Provider',
  description: 'Mock OAuth2 provider for testing',
  secretId: 'MOCK_OAUTH_APP',
  tokenSecretId: 'MOCK_OAUTH_TOKENS',
  authorizationUrl: 'http://localhost:8080/authorize',
  tokenUrl: 'http://localhost:8080/token',
  scopes: ['openid', 'profile', 'email'],
})
