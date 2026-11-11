/**
 * Test file to verify TypedSecretService type inference works correctly.
 * This test validates both compile-time types and runtime behavior.
 *
 * This validates the same pattern used in recipes/function-addon:
 * - defineSecret with Zod schema for type-safe secrets
 * - TypedSecretService provides compile-time validated access
 */

import { LocalSecretService, LocalVariablesService } from '@pikku/core/services'
import type { CredentialsMap } from '../.pikku/secrets/pikku-secrets.gen.js'
import { TypedSecretService } from '../.pikku/secrets/pikku-secrets.gen.js'

// ============================================================================
// Compile-time type assertions (these ensure the generated types are correct)
// ============================================================================

// Verify EXAMPLE_API_CREDENTIALS has the correct inferred Zod schema type
type ApiCredentialsType = CredentialsMap['EXAMPLE_API_CREDENTIALS']
// @ts-expect-error - apiKey should be required
void ({ apiSecret: 'x' } satisfies ApiCredentialsType)
// @ts-expect-error - apiSecret should be required
void ({ apiKey: 'x' } satisfies ApiCredentialsType)
// This should compile - all required fields present, optional baseUrl omitted
void ({
  apiKey: 'key',
  apiSecret: 'secret',
} satisfies ApiCredentialsType)

// Runtime test
async function testTypedSecretService() {
  console.log('Testing TypedSecretService type inference...\n')

  // Set secrets via the variables service
  const variablesService = new LocalVariablesService()
  variablesService.set('EXAMPLE_API_CREDENTIALS', {
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    baseUrl: 'https://api.example.com',
  })
  const secretService = new LocalSecretService(variablesService)
  const secrets = new TypedSecretService(secretService)

  // Test 1: getSecret() returns correct types
  console.log('Test 1: Type inference for getSecret()')

  // `getSecret` hands back a `SecretValue`, so the shape is only reachable
  // through a deliberate `.reveal()` — the typed inference this asserts now
  // applies to what `.reveal()` returns.
  const apiCreds = (await secrets.getSecret('EXAMPLE_API_CREDENTIALS')).reveal()
  console.log(`  EXAMPLE_API_CREDENTIALS.apiKey: ${apiCreds.apiKey}`)
  console.log(`  EXAMPLE_API_CREDENTIALS.apiSecret: ${apiCreds.apiSecret}`)
  console.log(`  EXAMPLE_API_CREDENTIALS.baseUrl: ${apiCreds.baseUrl}`)

  // Test 2: hasSecret() method
  console.log('\nTest 2: hasSecret() method')
  const hasApi = await secrets.hasSecret('EXAMPLE_API_CREDENTIALS')
  console.log(`  hasSecret(EXAMPLE_API_CREDENTIALS): ${hasApi}`)

  if (!hasApi) {
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
    throw new Error(`Expected 3 secrets, got ${allStatus.length}`)
  }

  // The OAuth2 credential declares no secret of its own: the app credential
  // and the token store are derived from `oauth2`, so a deployment is asked
  // for them without anyone restating a shape the runtime already fixes.
  for (const secretId of ['MOCK_OAUTH_APP', 'MOCK_OAUTH_TOKENS'] as const) {
    if (!allStatus.some((status) => status.secretId === secretId)) {
      throw new Error(`Expected ${secretId} to be derived from the credential`)
    }
  }

  // Test 4: getMissing() - the derived OAuth2 secrets are optional, so an
  // unconfigured OAuth app is not something the deployment is missing
  console.log('\nTest 4: getMissing()')
  const missing = await secrets.getMissing()
  console.log(`  Missing secrets: ${missing.length}`)

  if (missing.length !== 0) {
    throw new Error(`Expected 0 missing secrets, got ${missing.length}`)
  }

  // Test 5: Test with missing secrets
  console.log('\nTest 5: Test with missing secrets')
  variablesService.delete('EXAMPLE_API_CREDENTIALS')

  const emptySecrets = new TypedSecretService(
    new LocalSecretService(new LocalVariablesService())
  )
  const missingCreds = await emptySecrets.getMissing()
  console.log(`  Missing when empty: ${missingCreds.length}`)

  if (missingCreds.length !== 1) {
    throw new Error(`Expected 1 missing secret, got ${missingCreds.length}`)
  }

  // Test 6: setSecret() type enforcement
  console.log('\nTest 6: setSecret() type enforcement')
  await secrets.setSecret('EXAMPLE_API_CREDENTIALS', {
    apiKey: 'new-key',
    apiSecret: 'new-secret',
    // @ts-expect-error - extra properties should cause type error
    extraProperty: 5,
  })
  console.log('  setSecret() rejects extra properties at compile time')

  console.log('\n✓ All TypedSecretService tests passed!')
}

testTypedSecretService().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
