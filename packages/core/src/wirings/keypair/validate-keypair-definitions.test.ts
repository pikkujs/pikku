import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { validateAndBuildKeyPairDefinitionsMeta } from './validate-keypair-definitions.js'
import { KEY_PAIR_FIELDS } from './keypair.types.js'
import type { KeyPairDefinitions } from './keypair.types.js'

const base = {
  name: 'vault-audit',
  displayName: 'Vault audit',
  algorithm: 'ed25519',
  purpose: 'signing',
  rotationPeriod: '180day',
  verifyGrace: '1h',
  scope: 'deployment',
  sourceFile: '/app/keys.ts',
} as const

const one = (over: Record<string, unknown> = {}): KeyPairDefinitions =>
  [{ ...base, ...over }] as KeyPairDefinitions

const build = (over: Record<string, unknown> = {}) =>
  validateAndBuildKeyPairDefinitionsMeta(one(over))

describe('every declared field reaches meta', () => {
  test('a fully populated declaration round-trips field by field', () => {
    const full = {
      name: 'console-auth',
      displayName: 'Console auth',
      description: 'Signs console tokens',
      algorithm: 'rs256',
      purpose: 'signing',
      rotationPeriod: '90day',
      verifyGrace: '1d',
      signedLifetime: '1h',
      scope: 'keyed',
      custody: 'wrapped',
      public: 'jwks',
      docsUrl: 'https://example.com/keys',
      sourceFile: '/app/keys.ts',
    }
    const meta = build(full)['console-auth']!
    for (const field of KEY_PAIR_FIELDS) {
      assert.equal(
        (meta as Record<string, unknown>)[field],
        (full as Record<string, unknown>)[field],
        `field '${field}' did not reach meta`
      )
    }
  })

  test('KEY_PAIR_FIELDS lists every field the full fixture sets', () => {
    assert.deepEqual([...KEY_PAIR_FIELDS].sort(), [
      'algorithm',
      'custody',
      'description',
      'displayName',
      'docsUrl',
      'name',
      'public',
      'purpose',
      'rotationPeriod',
      'scope',
      'signedLifetime',
      'verifyGrace',
    ])
  })
})

describe('algorithm allow-list', () => {
  for (const alg of ['hs256', 'es256', 'ps256', 'rsa-pss', 'rs1024', 'ecdsa']) {
    test(`${alg} is rejected, naming the allow-list`, () => {
      assert.throws(
        () => build({ algorithm: alg }),
        /algorithm '.*' is not allowed.*ed25519, x25519, rs256/s
      )
    })
  }

  test('algorithm and purpose must pair', () => {
    assert.throws(
      () => build({ algorithm: 'x25519', purpose: 'signing' }),
      /x25519 is a sealing algorithm/
    )
    assert.throws(
      () => build({ algorithm: 'ed25519', purpose: 'sealing' }),
      /ed25519 is a signing algorithm/
    )
    assert.throws(
      () => build({ algorithm: 'rs256', purpose: 'sealing' }),
      /rs256 is a signing algorithm/
    )
  })

  test('the three allowed algorithms pass', () => {
    build()
    build({ algorithm: 'rs256' })
    build({ algorithm: 'x25519', purpose: 'sealing' })
  })
})

describe('grace and rotation rules', () => {
  test('verifyGrace under one hour is rejected', () => {
    assert.throws(() => build({ verifyGrace: '59min' }), /at least 1h/)
  })

  test('verifyGrace must cover signedLifetime + cache + skew', () => {
    assert.throws(
      () => build({ verifyGrace: '1h', signedLifetime: '2h' }),
      /signedLifetime \(2h\)/
    )
    build({ verifyGrace: '3h', signedLifetime: '2h' })
    // 1h - 10min - 5s is the longest lifetime a 1h grace can carry
    build({ verifyGrace: '1h', signedLifetime: '49min' })
    assert.throws(
      () => build({ verifyGrace: '1h', signedLifetime: '50min' }),
      /verifyGrace/
    )
  })

  test('rotationPeriod must be at least twice verifyGrace', () => {
    assert.throws(
      () => build({ verifyGrace: '2day', rotationPeriod: '3day' }),
      /at least 2 x verifyGrace/
    )
    build({ verifyGrace: '2day', rotationPeriod: '4day' })
  })

  test("rotationPeriod 'never' is accepted, verifyGrace 'never' is not", () => {
    build({ rotationPeriod: 'never' })
    assert.throws(() => build({ verifyGrace: 'never' }), /verifyGrace/)
  })

  test('a malformed duration is rejected with the property named', () => {
    assert.throws(() => build({ rotationPeriod: 'soon' }), /rotationPeriod/)
    assert.throws(() => build({ verifyGrace: '1 hour' }), /verifyGrace/)
  })

  test('signedLifetime on a sealing key is rejected', () => {
    assert.throws(
      () =>
        build({
          algorithm: 'x25519',
          purpose: 'sealing',
          signedLifetime: '5min',
        }),
      /signedLifetime.*sealing/
    )
  })
})

describe('other validation', () => {
  test('scope is deployment or keyed', () => {
    build({ scope: 'keyed' })
    assert.throws(() => build({ scope: 'tenant' }), /scope/)
  })

  test('custody file with scope keyed is an error', () => {
    assert.throws(
      () => build({ custody: 'file', scope: 'keyed' }),
      /custody 'file'.*keyed/
    )
  })

  test('custody and public values are checked', () => {
    assert.throws(() => build({ custody: 'disk' }), /custody/)
    assert.throws(() => build({ public: 'yes' }), /public/)
  })

  test('names are kebab-case and unique', () => {
    assert.throws(() => build({ name: 'Vault_Audit' }), /kebab-case/)
    assert.throws(
      () =>
        validateAndBuildKeyPairDefinitionsMeta([
          ...one(),
          ...one({ sourceFile: '/app/other.ts' }),
        ]),
      /declared twice.*keys\.ts.*other\.ts/s
    )
  })

  test('a non-literal value is rejected as such', () => {
    assert.throws(() => build({ algorithm: 'ALGORITHM_CONST' }), /algorithm/)
  })

  test('rotationMode and signedFormat name the stage that adds them', () => {
    assert.throws(() => build({ rotationMode: 'pinned' }), /stage 3b/)
    assert.throws(() => build({ signedFormat: 'jws' }), /signedFormat.*O1/)
  })

  test('errors name the declaring file', () => {
    assert.throws(() => build({ algorithm: 'hs256' }), /keys\.ts/)
  })
})

describe('meta file', () => {
  test('is deterministic regardless of declaration order', () => {
    const a = { ...base, name: 'a-key' }
    const b = { ...base, name: 'b-key', sourceFile: '/app/b.ts' }
    const ab = validateAndBuildKeyPairDefinitionsMeta([a, b] as never)
    const ba = validateAndBuildKeyPairDefinitionsMeta([b, a] as never)
    assert.equal(JSON.stringify(ab, null, 2), JSON.stringify(ba, null, 2))
    assert.deepEqual(Object.keys(ab), ['a-key', 'b-key'])
  })

  test('does not carry the absolute source path', () => {
    assert.equal('sourceFile' in build()['vault-audit']!, false)
  })

  test('field order is fixed, not input order', () => {
    const reordered = { sourceFile: '/x', scope: 'deployment', ...base }
    const x = validateAndBuildKeyPairDefinitionsMeta([reordered] as never)
    assert.equal(JSON.stringify(x), JSON.stringify(build()))
  })
})

describe('no private key material in the declaration surface', () => {
  test('no field name can carry a private key', () => {
    const forbidden = /private|secret|seed|pem|jwk|material|\bd\b|pkcs/i
    for (const field of KEY_PAIR_FIELDS) {
      assert.doesNotMatch(field, forbidden, `field '${field}'`)
    }
  })

  test('meta of a fully populated key has only declared fields', () => {
    const meta = build({ description: 'x', docsUrl: 'u', custody: 'secret' })
    for (const key of Object.keys(meta['vault-audit']!)) {
      assert.ok(
        (KEY_PAIR_FIELDS as readonly string[]).includes(key),
        `unexpected meta key '${key}'`
      )
    }
  })
})
