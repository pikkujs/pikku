import { test } from 'node:test'
import assert from 'node:assert/strict'
// The reference provider, straight from source: core ships no cryptography, so its tests borrow jose's.
import { createJoseKeyCrypto } from '../../../services/jose/src/keys.js'

export const testCrypto = createJoseKeyCrypto()

test('the jose reference provider is reachable from the core key tests', async () => {
  assert.equal(typeof testCrypto.generate, 'function')
  assert.ok((await testCrypto.generate('ed25519')).publicKey)
})
