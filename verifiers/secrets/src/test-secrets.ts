/**
 * Test file to verify TypedSecretService type inference works correctly.
 * This test validates both compile-time types and runtime behavior.
 */

import { LocalSecretService, VariablesService } from '@pikku/core/services'
import { TypedSecretService } from '../.pikku/secrets/pikku-secrets.gen.js'

// Inline VariablesService that reads from process.env
class EnvVariablesService implements VariablesService {
  get(key: string): string | undefined {
    return process.env[key]
  }
  getAll(): Record<string, string> {
    return process.env as Record<string, string>
  }
}

// Runtime test
async function testTypedSecretService() {
  console.log('Testing TypedSecretService type inference...\n')

  // Set secrets via process.env
  process.env.EXAMPLE_API_CREDENTIALS = JSON.stringify({
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    baseUrl: 'https://api.example.com',
  })
  process.env.MOCK_OAUTH_APP = JSON.stringify({
    clientId: 'mock-client-id',
    clientSecret: 'mock-client-secret',
  })
  process.env.MOCK_OAUTH_TOKENS = JSON.stringify({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: Date.now() + 3600000,
    tokenType: 'Bearer',
    scope: 'openid profile email',
  })

  const variablesService = new EnvVariablesService()
  const secretService = new LocalSecretService(variablesService)
  const secrets = new TypedSecretService(secretService)

  // Test 1: getSecretJSON() returns correct types
  console.log('Test 1: Type inference for getSecretJSON()')

  const apiCreds = await secrets.getSecretJSON('EXAMPLE_API_CREDENTIALS')
  console.log(`  EXAMPLE_API_CREDENTIALS.apiKey: ${apiCreds.apiKey}`)
  console.log(`  EXAMPLE_API_CREDENTIALS.apiSecret: ${apiCreds.apiSecret}`)
  console.log(`  EXAMPLE_API_CREDENTIALS.baseUrl: ${apiCreds.baseUrl}`)

  const appCreds = await secrets.getSecretJSON('MOCK_OAUTH_APP')
  console.log(`  MOCK_OAUTH_APP.clientId: ${appCreds.clientId}`)
  console.log(`  MOCK_OAUTH_APP.clientSecret: ${appCreds.clientSecret}`)

  const tokens = await secrets.getSecretJSON('MOCK_OAUTH_TOKENS')
  console.log(`  MOCK_OAUTH_TOKENS.accessToken: ${tokens.accessToken}`)
  console.log(`  MOCK_OAUTH_TOKENS.refreshToken: ${tokens.refreshToken}`)
  console.log(`  MOCK_OAUTH_TOKENS.expiresAt: ${tokens.expiresAt}`)

  // Test 2: hasSecret() method
  console.log('\nTest 2: hasSecret() method')
  const hasApi = await secrets.hasSecret('EXAMPLE_API_CREDENTIALS')
  const hasOAuth = await secrets.hasSecret('MOCK_OAUTH_APP')
  console.log(`  hasSecret(EXAMPLE_API_CREDENTIALS): ${hasApi}`)
  console.log(`  hasSecret(MOCK_OAUTH_APP): ${hasOAuth}`)

  if (!hasApi || !hasOAuth) {
    throw new Error('hasSecret() should return true for configured secrets')
  }

  // Test 3: getAllStatus()
  console.log('\nTest 3: getAllStatus()')
  const allStatus = await secrets.getAllStatus()
  for (const status of allStatus) {
    console.log(
      `  ${status.secretId}: configured=${status.isConfigured}, name=${status.name}`
    )
  }

  if (allStatus.length !== 3) {
    throw new Error(`Expected 3 credentials, got ${allStatus.length}`)
  }

  // Test 4: getMissing() - should be empty since all are configured
  console.log('\nTest 4: getMissing()')
  const missing = await secrets.getMissing()
  console.log(`  Missing credentials: ${missing.length}`)

  if (missing.length !== 0) {
    throw new Error(`Expected 0 missing credentials, got ${missing.length}`)
  }

  // Test 5: Test with missing secrets
  console.log('\nTest 5: Test with missing secrets')
  delete process.env.EXAMPLE_API_CREDENTIALS
  delete process.env.MOCK_OAUTH_APP
  delete process.env.MOCK_OAUTH_TOKENS

  const emptySecrets = new TypedSecretService(
    new LocalSecretService(new EnvVariablesService())
  )
  const missingCreds = await emptySecrets.getMissing()
  console.log(`  Missing when empty: ${missingCreds.length}`)

  if (missingCreds.length !== 3) {
    throw new Error(
      `Expected 3 missing credentials, got ${missingCreds.length}`
    )
  }

  // Test 6: setSecretJSON() type enforcement
  console.log('\nTest 6: setSecretJSON() type enforcement')
  await secrets.setSecretJSON('EXAMPLE_API_CREDENTIALS', {
    apiKey: 'new-key',
    apiSecret: 'new-secret',
    // @ts-expect-error - extra properties should cause type error
    extraProperty: 5,
  })
  console.log('  setSecretJSON() rejects extra properties at compile time')

  console.log('\n✓ All TypedSecretService tests passed!')
}

testTypedSecretService().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
