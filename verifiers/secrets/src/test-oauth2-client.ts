/**
 * Test file for OAuth2Client functionality against the mock OAuth server.
 * Tests the full OAuth2 flow end-to-end.
 */

import { OAuth2Server } from 'oauth2-mock-server'
import { OAuth2Client } from '@pikku/core/oauth2'
import { LocalSecretService, VariablesService } from '@pikku/core/services'

// Inline VariablesService for testing
class TestVariablesService implements VariablesService {
  private store: Record<string, string> = {}

  set(key: string, value: string) {
    this.store[key] = value
  }

  get(key: string): string | undefined {
    return this.store[key]
  }

  getAll(): Record<string, string> {
    return this.store
  }
}

async function testOAuth2Client() {
  console.log('Testing OAuth2Client against mock server...\n')

  // Start mock OAuth server
  console.log('Starting OAuth2 mock server...')
  const server = new OAuth2Server()
  await server.issuer.keys.generate('RS256')
  await server.start(8081, 'localhost')
  console.log('  Mock server running at http://localhost:8081\n')

  try {
    const variablesService = new TestVariablesService()
    const secretService = new LocalSecretService(variablesService)

    // Set up app credentials
    variablesService.set(
      'TEST_OAUTH_APP',
      JSON.stringify({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      })
    )

    const oauth2Config = {
      tokenSecretId: 'TEST_OAUTH_TOKENS',
      authorizationUrl: 'http://localhost:8081/authorize',
      tokenUrl: 'http://localhost:8081/token',
      scopes: ['openid', 'profile'],
    }

    const client = new OAuth2Client(
      oauth2Config,
      'TEST_OAUTH_APP',
      secretService
    )

    // Test 1: getAuthorizationUrl
    console.log('Test 1: getAuthorizationUrl()')
    const authUrl = await client.getAuthorizationUrl(
      'test-state-123',
      'http://localhost:3000/callback'
    )

    if (!authUrl.includes('localhost:8081/authorize')) {
      throw new Error(
        `Expected auth URL to contain localhost:8081/authorize, got: ${authUrl}`
      )
    }
    if (!authUrl.includes('client_id=test-client-id')) {
      throw new Error(`Expected auth URL to contain client_id, got: ${authUrl}`)
    }
    if (!authUrl.includes('state=test-state-123')) {
      throw new Error(`Expected auth URL to contain state, got: ${authUrl}`)
    }
    console.log('  ✓ Authorization URL generated correctly')
    console.log(`    URL: ${authUrl}\n`)

    // Test 2: exchangeCode - exchange an auth code for tokens
    console.log('Test 2: exchangeCode()')
    // The mock server accepts any code and returns valid tokens
    const token = await client.exchangeCode(
      'mock-auth-code',
      'http://localhost:3000/callback'
    )

    if (!token.accessToken) {
      throw new Error('Expected accessToken in response')
    }
    console.log('  ✓ Code exchange successful')
    console.log(`    Access Token: ${token.accessToken.substring(0, 50)}...`)
    console.log(`    Token Type: ${token.tokenType}`)
    console.log(
      `    Expires At: ${token.expiresAt ? new Date(token.expiresAt).toISOString() : 'N/A'}\n`
    )

    // Test 3: getAccessToken - should return cached token
    console.log('Test 3: getAccessToken() - from cache')
    const cachedToken = await client.getAccessToken()

    if (cachedToken !== token.accessToken) {
      throw new Error('Expected cached token to match exchanged token')
    }
    console.log('  ✓ Token retrieved from cache\n')

    // Test 4: New client loads token from secrets
    console.log('Test 4: New client loads token from secrets')
    // Store the token in secrets
    variablesService.set('TEST_OAUTH_TOKENS', JSON.stringify(token))

    const newClient = new OAuth2Client(
      oauth2Config,
      'TEST_OAUTH_APP',
      secretService
    )
    const loadedToken = await newClient.getAccessToken()

    if (loadedToken !== token.accessToken) {
      throw new Error('Expected loaded token to match stored token')
    }
    console.log('  ✓ Token loaded from secrets correctly\n')

    // Test 5: Token refresh (simulate expired token)
    console.log('Test 5: Token refresh')
    // Store an expired token with refresh token
    variablesService.set(
      'TEST_OAUTH_TOKENS',
      JSON.stringify({
        accessToken: 'expired-token',
        refreshToken: token.refreshToken || 'mock-refresh-token',
        expiresAt: Date.now() - 1000, // Expired
        tokenType: 'Bearer',
      })
    )

    const refreshClient = new OAuth2Client(
      oauth2Config,
      'TEST_OAUTH_APP',
      secretService
    )
    const refreshedToken = await refreshClient.getAccessToken()

    if (refreshedToken === 'expired-token') {
      throw new Error('Expected new token after refresh, got expired token')
    }
    console.log('  ✓ Token refreshed successfully')
    console.log(`    New Token: ${refreshedToken.substring(0, 50)}...\n`)

    console.log('✓ All OAuth2Client tests passed!')
  } finally {
    // Stop the mock server
    console.log('\nStopping mock server...')
    await server.stop()
  }
}

testOAuth2Client().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
