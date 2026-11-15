import { test, describe } from 'node:test'
import * as assert from 'assert'
import { validateAndBuildKeyPairDefinitionsMeta } from '@pikku/core/keypair'
import { serializeKeyPairsTypes } from './serialize-keypairs-types.js'

const def = (over: Record<string, unknown>) => ({
  displayName: 'X',
  rotationPeriod: '90day',
  verifyGrace: '1d',
  scope: 'deployment',
  sourceFile: '/x.ts',
  ...over,
})

describe('serializeKeyPairsTypes', () => {
  test('an empty project still gets a map to type keys against', () => {
    const out = serializeKeyPairsTypes({})
    assert.match(out, /export type KeyPairsMap = \{\}/)
    assert.match(
      out,
      /export type SigningKeyName = CoreSigningKeyName<KeyPairsMap>/
    )
    assert.match(
      out,
      /export type SealingKeyName = CoreSealingKeyName<KeyPairsMap>/
    )
  })

  test('records name, purpose and algorithm per key, and nothing else', () => {
    const meta = validateAndBuildKeyPairDefinitionsMeta([
      def({ name: 'console-auth', algorithm: 'ed25519', purpose: 'signing' }),
      def({ name: 'vault', algorithm: 'x25519', purpose: 'sealing' }),
    ] as never)
    const out = serializeKeyPairsTypes(meta)
    assert.match(
      out,
      /"console-auth": \{ purpose: "signing"; algorithm: "ed25519" \}/
    )
    assert.match(out, /"vault": \{ purpose: "sealing"; algorithm: "x25519" \}/)
    assert.doesNotMatch(out, /rotationPeriod|verifyGrace|sourceFile/)
  })

  test('is deterministic regardless of declaration order', () => {
    const a = def({ name: 'a-key', algorithm: 'ed25519', purpose: 'signing' })
    const b = def({ name: 'b-key', algorithm: 'ed25519', purpose: 'signing' })
    const one = serializeKeyPairsTypes(
      validateAndBuildKeyPairDefinitionsMeta([a, b] as never)
    )
    const two = serializeKeyPairsTypes(
      validateAndBuildKeyPairDefinitionsMeta([b, a] as never)
    )
    assert.equal(one, two)
  })
})
