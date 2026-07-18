import { wireCredential } from '@pikku/core/credential'
import { z } from 'zod'

// Points at the same mock OAuth provider the link suite already runs, so the
// requirements view's "Connect" action can complete a real round-trip in e2e.
const mockProviderPort = Number(process.env.MOCK_OAUTH_PORT ?? 4098)
const mockProviderUrl = `http://localhost:${mockProviderPort}`

export const FakeCrmSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
})

wireCredential({
  name: 'fake-crm',
  displayName: 'Fake CRM',
  description: 'OAuth2 connection to the (fake) CRM this addon talks to',
  type: 'wire',
  schema: FakeCrmSchema,
  oauth2: {
    appCredentialSecretId: 'MOCK_OAUTH_APP',
    tokenSecretId: 'FAKE_CRM_TOKENS',
    authorizationUrl: `${mockProviderUrl}/authorize`,
    tokenUrl: `${mockProviderUrl}/token`,
    scopes: ['read'],
  },
})
