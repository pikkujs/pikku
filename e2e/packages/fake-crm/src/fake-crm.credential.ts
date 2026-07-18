import { wireCredential } from '@pikku/core/credential'
import { z } from 'zod'

export const FakeCrmSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
})

// URLs must be literals: the inspector captures oauth2 config verbatim into the
// generated meta (it does not evaluate expressions), and this meta is merged
// into the consuming app's CREDENTIAL_OAUTH2_CONFIGS. A `${...}` template would
// serialize as broken source text. Point at the same mock OAuth provider the
// link suite runs (port 4098) so the "Connect" action completes a real
// round-trip in e2e — matching the app-root `mock-oauth` credential.
wireCredential({
  name: 'fake-crm',
  displayName: 'Fake CRM',
  description: 'OAuth2 connection to the (fake) CRM this addon talks to',
  type: 'singleton',
  schema: FakeCrmSchema,
  oauth2: {
    appCredentialSecretId: 'MOCK_OAUTH_APP',
    tokenSecretId: 'FAKE_CRM_TOKENS',
    authorizationUrl: 'http://localhost:4098/authorize',
    tokenUrl: 'http://localhost:4098/token',
    scopes: ['read'],
  },
})
