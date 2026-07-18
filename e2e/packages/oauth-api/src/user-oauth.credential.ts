import { wireCredential } from '@pikku/core/credential'
import { z } from 'zod'

export const UserOAuthSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
})

// URLs must be literals: the inspector captures oauth2 config verbatim into the
// generated meta (it does not evaluate expressions), and addon credential meta
// is now merged into the consuming app's CREDENTIAL_OAUTH2_CONFIGS. A `${...}`
// template would serialize as broken source text. Points at the mock OAuth
// provider (port 4098) the link suite runs.
wireCredential({
  name: 'user-oauth',
  displayName: 'User OAuth',
  description: 'Per-user OAuth2 credential',
  type: 'wire',
  schema: UserOAuthSchema,
  oauth2: {
    appCredentialSecretId: 'MOCK_OAUTH_APP',
    tokenSecretId: 'USER_OAUTH_TOKENS',
    authorizationUrl: 'http://localhost:4098/authorize',
    tokenUrl: 'http://localhost:4098/token',
    scopes: ['read', 'write'],
  },
})
