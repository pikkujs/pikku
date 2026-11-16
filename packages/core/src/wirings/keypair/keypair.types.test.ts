import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import type { SealingKeyName, SigningKeyName } from './keypair.types.js'

type Map = {
  'vault-audit': { purpose: 'signing'; algorithm: 'ed25519' }
  'console-auth': { purpose: 'signing'; algorithm: 'rs256' }
  'vault-sealing': { purpose: 'sealing'; algorithm: 'x25519' }
}

const signMap = (name: SigningKeyName<Map>) => name
const openMap = (name: SealingKeyName<Map>) => name

describe('sign and open are mutually exclusive at the type level', () => {
  test('a signing name is accepted by sign', () => {
    assert.equal(signMap('vault-audit'), 'vault-audit')
    assert.equal(signMap('console-auth'), 'console-auth')
  })

  test('a sealing name is accepted by open', () => {
    assert.equal(openMap('vault-sealing'), 'vault-sealing')
  })

  test('sign rejects a sealing name', () => {
    // @ts-expect-error 'vault-sealing' is a sealing key
    signMap('vault-sealing')
  })

  test('open rejects a signing name', () => {
    // @ts-expect-error 'vault-audit' is a signing key
    openMap('vault-audit')
  })

  test('the unions are exact', () => {
    const s: SigningKeyName<Map>[] = ['vault-audit', 'console-auth']
    const o: SealingKeyName<Map>[] = ['vault-sealing']
    assert.equal(s.length + o.length, 3)
    const neverSigning: [SigningKeyName<{}>] extends [never] ? true : false =
      true
    assert.equal(neverSigning, true)
  })
})
