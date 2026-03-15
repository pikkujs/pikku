import { createOAuth2Handler } from '@pikku/core/oauth2'
import { defineHTTPRoutes, wireHTTPRoutes } from '#pikku/pikku-types.gen.js'

const mockProviderPort = Number(process.env.MOCK_OAUTH_PORT ?? 4098)
const mockProviderUrl = `http://localhost:${mockProviderPort}`

const oauth2 = createOAuth2Handler({
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

const oauth2Routes = defineHTTPRoutes({
  auth: true,
  basePath: '/credentials',
  routes: {
    connect: {
      method: 'get',
      route: '/:name/connect',
      func: oauth2.connect,
    },
    callback: {
      method: 'get',
      route: '/:name/callback',
      func: oauth2.callback,
      auth: false,
    },
    disconnect: {
      method: 'delete',
      route: '/:name',
      func: oauth2.disconnect,
    },
    status: {
      method: 'get',
      route: '/:name/status',
      func: oauth2.status,
    },
  },
})

wireHTTPRoutes({ routes: { credentials: oauth2Routes } })
