import { wireHTTPRoutes } from '#pikku/pikku-types.gen.js'
import { createOAuth2Routes } from '@pikku/core/oauth2'

const mockProviderPort = Number(process.env.MOCK_OAUTH_PORT ?? 4098)
const mockProviderUrl = `http://localhost:${mockProviderPort}`

const oauth2Routes = createOAuth2Routes({
  credentialsMeta: {
    'test-oauth': {
      name: 'test-oauth',
      displayName: 'Test OAuth Provider',
      type: 'wire',
      oauth2: {
        tokenSecretId: 'TEST_OAUTH_TOKENS',
        authorizationUrl: `${mockProviderUrl}/authorize`,
        tokenUrl: `${mockProviderUrl}/token`,
        scopes: ['read', 'write'],
        appCredentialSecretId: 'MOCK_OAUTH_APP',
      },
    },
  },
})

wireHTTPRoutes({ routes: { credentials: oauth2Routes as any } })
