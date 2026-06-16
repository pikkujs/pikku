/**
 * Test file to verify TypedSecretService type inference works correctly.
 * This test validates both compile-time types and runtime behavior.
 *
 * This validates the same pattern used in templates/function-addon:
 * - wireSecret with Zod schema for type-safe secrets
 * - TypedSecretService provides compile-time validated access
 */

import type { VariablesService } from '@pikku/core/services'
import { LocalSecretService } from '@pikku/core/services'
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

// Inline VariablesService that reads from process.env
class EnvVariablesService implements VariablesService {
  get<T = string>(key: string): T | undefined {
    const raw = process.env[key]
    if (raw === undefined) return undefined
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  }
  getVariables<T extends Record<string, unknown> = Record<string, unknown>>(
    names: (keyof T & string)[]
  ): Partial<T> {
    const out: Record<string, unknown> = {}
    for (const key of names) {
      const value = this.get(key)
      if (value !== undefined) out[key] = value
    }
    return out as Partial<T>
  }
  getAll(): Record<string, string> {
    return process.env as Record<string, string>
  }
  set(name: string, value: unknown): void {
    process.env[name] =
      typeof value === 'string' ? value : JSON.stringify(value)
  }
  has(name: string): boolean {
    return process.env[name] !== undefined
  }
  delete(name: string): void {
    delete process.env[name]
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

  const variablesService = new EnvVariablesService()
  const secretService = new LocalSecretService(variablesService)
  const secrets = new TypedSecretService(secretService)

  // Test 1: getSecret() returns correct types
  console.log('Test 1: Type inference for getSecret()')

  const apiCreds = await secrets.getSecret('EXAMPLE_API_CREDENTIALS')
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

  if (allStatus.length !== 1) {
    throw new Error(`Expected 1 secret, got ${allStatus.length}`)
  }

  // Test 4: getMissing() - should be empty since all are configured
  console.log('\nTest 4: getMissing()')
  const missing = await secrets.getMissing()
  console.log(`  Missing secrets: ${missing.length}`)

  if (missing.length !== 0) {
    throw new Error(`Expected 0 missing secrets, got ${missing.length}`)
  }

  // Test 5: Test with missing secrets
  console.log('\nTest 5: Test with missing secrets')
  delete process.env.EXAMPLE_API_CREDENTIALS

  const emptySecrets = new TypedSecretService(
    new LocalSecretService(new EnvVariablesService())
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
