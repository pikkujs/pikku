/**
 * Test file to verify TypedCredentialService type inference works correctly.
 * This validates wireCredential declarations and the generated typed wrapper.
 */

import { LocalCredentialService } from '@pikku/core/services'
import { TypedCredentialService } from '../.pikku/credentials/pikku-credentials.gen.js'

async function testTypedCredentialService() {
  console.log('Testing TypedCredentialService type inference...\n')

  const credentialService = new LocalCredentialService()
  const credentials = new TypedCredentialService(credentialService)

  // Test 1: getAllStatus() returns credential metadata
  console.log('Test 1: getAllStatus() returns credential metadata')
  const allStatus = await credentials.getAllStatus()
  console.log(`  Total credentials: ${allStatus.length}`)
  for (const status of allStatus) {
    console.log(
      `  ${status.name}: type=${status.type}, oauth2=${status.oauth2 ?? false}, configured=${status.isConfigured}`
    )
  }

  if (allStatus.length !== 1) {
    throw new Error(`Expected 1 credential, got ${allStatus.length}`)
  }

  const mockCred = allStatus.find((c) => c.name === 'mock')
  if (!mockCred) {
    throw new Error("Expected credential named 'mock'")
  }
  if (mockCred.type !== 'singleton') {
    throw new Error(`Expected type 'singleton', got '${mockCred.type}'`)
  }
  if (!mockCred.oauth2) {
    throw new Error('Expected oauth2 to be true')
  }

  // Test 2: getMissing() - should show all as missing initially
  console.log('\nTest 2: getMissing() - all missing initially')
  const missing = await credentials.getMissing()
  console.log(`  Missing credentials: ${missing.length}`)

  if (missing.length !== 1) {
    throw new Error(`Expected 1 missing credential, got ${missing.length}`)
  }

  // Test 3: set() and get() - store and retrieve a credential
  console.log('\nTest 3: set() and get() - platform credential')
  await credentials.set('mock', {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
  })

  const retrieved = await credentials.get('mock')
  console.log(`  Retrieved: ${JSON.stringify(retrieved)}`)

  if (!retrieved || (retrieved as any).accessToken !== 'test-access-token') {
    throw new Error('Failed to retrieve stored credential')
  }

  // Test 4: has() - check existence
  console.log('\nTest 4: has() - check existence')
  const hasMock = await credentials.has('mock')
  console.log(`  has('mock'): ${hasMock}`)

  if (!hasMock) {
    throw new Error("Expected has('mock') to return true")
  }

  // Test 5: getMissing() - should be empty after setting
  console.log('\nTest 5: getMissing() after setting credential')
  const missingAfter = await credentials.getMissing()
  console.log(`  Missing after set: ${missingAfter.length}`)

  if (missingAfter.length !== 0) {
    throw new Error(
      `Expected 0 missing credentials, got ${missingAfter.length}`
    )
  }

  // Test 6: Per-user credentials
  console.log('\nTest 6: Per-user credentials')
  await credentials.set('mock', { accessToken: 'user1-token' }, 'user-1')
  await credentials.set('mock', { accessToken: 'user2-token' }, 'user-2')

  const user1Cred = await credentials.get('mock', 'user-1')
  const user2Cred = await credentials.get('mock', 'user-2')
  console.log(`  user-1: ${JSON.stringify(user1Cred)}`)
  console.log(`  user-2: ${JSON.stringify(user2Cred)}`)

  if ((user1Cred as any)?.accessToken !== 'user1-token') {
    throw new Error('User 1 credential mismatch')
  }
  if ((user2Cred as any)?.accessToken !== 'user2-token') {
    throw new Error('User 2 credential mismatch')
  }

  // Test 7: delete()
  console.log('\nTest 7: delete()')
  await credentials.delete('mock', 'user-1')
  const deletedCred = await credentials.get('mock', 'user-1')
  console.log(`  After delete user-1: ${deletedCred}`)

  if (deletedCred !== null) {
    throw new Error('Expected null after delete')
  }

  // User 2 should still exist
  const user2Still = await credentials.get('mock', 'user-2')
  if ((user2Still as any)?.accessToken !== 'user2-token') {
    throw new Error(
      'User 2 credential should still exist after deleting user 1'
    )
  }

  // Test 8: getAll() for a user
  console.log('\nTest 8: getAll() for a user')
  const allUser2 = await credentials.getAll('user-2')
  console.log(`  user-2 credentials: ${JSON.stringify(allUser2)}`)

  if (!allUser2['mock']) {
    throw new Error("Expected 'mock' in user-2's credentials")
  }

  console.log('\n✓ All TypedCredentialService tests passed!')
}

testTypedCredentialService().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
