import { wireCredential } from '@pikku/core/credential'
import { z } from 'zod'

wireCredential({
  name: 'hmac-key',
  displayName: 'HMAC Signing Key',
  description: 'Secret key for HMAC signature operations',
  type: 'wire',
  schema: z.object({ secretKey: z.string() }),
})

wireCredential({
  name: 'stripe',
  displayName: 'Stripe API Key',
  description: 'API key for Stripe payment processing',
  type: 'wire',
  schema: z.object({ apiKey: z.string() }),
})

wireCredential({
  name: 'mock-oauth',
  displayName: 'Mock OAuth Provider',
  description: 'Demo OAuth2 credential using mock server (global)',
  type: 'singleton',
  schema: z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
  }),
  oauth2: {
    appCredentialSecretId: 'MOCK_OAUTH_APP',
    tokenSecretId: 'MOCK_OAUTH_TOKENS',
    authorizationUrl: 'http://localhost:4098/authorize',
    tokenUrl: 'http://localhost:4098/token',
    scopes: ['chat:write', 'channels:read'],
  },
})

wireCredential({
  name: 'user-oauth',
  displayName: 'User OAuth',
  description: 'Per-user OAuth2 credential using mock server',
  type: 'wire',
  schema: z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
  }),
  oauth2: {
    appCredentialSecretId: 'MOCK_OAUTH_APP',
    tokenSecretId: 'USER_OAUTH_TOKENS',
    authorizationUrl: 'http://localhost:4098/authorize',
    tokenUrl: 'http://localhost:4098/token',
    scopes: ['read', 'write'],
  },
})
