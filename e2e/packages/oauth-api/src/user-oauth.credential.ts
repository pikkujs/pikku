import { wireCredential } from '@pikku/core/credential'
import { z } from 'zod'

const mockProviderPort = Number(process.env.MOCK_OAUTH_PORT ?? 4098)
const mockProviderUrl = `http://localhost:${mockProviderPort}`

export const UserOAuthSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
})

wireCredential({
  name: 'user-oauth',
  displayName: 'User OAuth',
  description: 'Per-user OAuth2 credential',
  type: 'wire',
  schema: UserOAuthSchema,
  oauth2: {
    appCredentialSecretId: 'MOCK_OAUTH_APP',
    tokenSecretId: 'USER_OAUTH_TOKENS',
    authorizationUrl: `${mockProviderUrl}/authorize`,
    tokenUrl: `${mockProviderUrl}/token`,
    scopes: ['read', 'write'],
  },
})
