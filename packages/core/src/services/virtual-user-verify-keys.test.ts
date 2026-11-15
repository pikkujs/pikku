import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto'

import {
  okpThumbprint,
  rsaThumbprint,
  parseVirtualUserVerifyKeys,
  spkiToDer,
  base64ToBytes,
  bytesToBase64,
} from './virtual-user-verify-keys.js'

const spki = () =>
  generateKeyPairSync('ed25519')
    .publicKey.export({ format: 'der', type: 'spki' })
    .toString('base64')
const pem = (b64: string) =>
  `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`

// RFC 8037 appendix A.2 (the Ed25519 public key) and A.3 (its RFC 7638 thumbprint).
const RFC8037_X = '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo'
const RFC8037_THUMBPRINT = 'kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k'
const spkiFromX = (x: string) =>
  Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from(x, 'base64url'),
  ]).toString('base64')

describe('okpThumbprint', () => {
  test('matches the RFC 8037 A.3 known answer', async () => {
    assert.equal(await okpThumbprint(spkiFromX(RFC8037_X)), RFC8037_THUMBPRINT)
  })

  test('takes a PEM as well as base64 DER', async () => {
    const b64 = spkiFromX(RFC8037_X)
    assert.equal(await okpThumbprint(pem(b64)), RFC8037_THUMBPRINT)
  })

  test('throws for anything that is not an Ed25519 SPKI', async () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .publicKey.export({ format: 'der', type: 'spki' })
      .toString('base64')
    await assert.rejects(okpThumbprint(rsa), /Ed25519/)
    await assert.rejects(okpThumbprint('not base64!'), /base64/)
  })
})

describe('okpThumbprint for X25519 (sealing keys)', () => {
  test('is the RFC 7638 thumbprint with crv X25519, as node computes it', async () => {
    const { publicKey } = generateKeyPairSync('x25519')
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string }
    const canonical = `{"crv":"X25519","kty":"OKP","x":"${jwk.x}"}`
    const expected = createHash('sha256').update(canonical).digest('base64url')
    const b64 = publicKey
      .export({ format: 'der', type: 'spki' })
      .toString('base64')
    assert.equal(await okpThumbprint(b64), expected)
  })

  test('is not the thumbprint of an Ed25519 key with the same bytes', async () => {
    const { publicKey } = generateKeyPairSync('x25519')
    const der = publicKey.export({ format: 'der', type: 'spki' })
    const asEd = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      der.subarray(12),
    ]).toString('base64')
    assert.notEqual(
      await okpThumbprint(der.toString('base64')),
      await okpThumbprint(asEd)
    )
  })

  test('parseVirtualUserVerifyKeys still refuses an X25519 key', () => {
    const { publicKey } = generateKeyPairSync('x25519')
    const b64 = publicKey
      .export({ format: 'der', type: 'spki' })
      .toString('base64')
    assert.throws(() => parseVirtualUserVerifyKeys(b64), /Ed25519/)
  })
})

// RFC 7638 section 3.1: the example RSA key and its thumbprint.
const RFC7638_N =
  '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw'
const RFC7638_THUMBPRINT = 'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs'
const rfc7638Spki = () =>
  createPublicKey({
    key: { kty: 'RSA', n: RFC7638_N, e: 'AQAB' },
    format: 'jwk',
  })
    .export({ format: 'der', type: 'spki' })
    .toString('base64')

describe('rsaThumbprint', () => {
  test('matches the RFC 7638 section 3.1 known answer (members e, kty, n)', async () => {
    assert.equal(await rsaThumbprint(rfc7638Spki()), RFC7638_THUMBPRINT)
  })

  test('takes a PEM, and refuses an Ed25519 key or garbage', async () => {
    assert.equal(await rsaThumbprint(pem(rfc7638Spki())), RFC7638_THUMBPRINT)
    await assert.rejects(rsaThumbprint(spkiFromX(RFC8037_X)))
    await assert.rejects(rsaThumbprint('not a key!'), /base64/)
  })
})

describe('parseVirtualUserVerifyKeys', () => {
  test('a single base64 key is one entry, no kid', () => {
    const a = spki()
    assert.deepEqual(parseVirtualUserVerifyKeys(a), [{ publicKey: a }])
  })

  test('a PEM-looking string is still the single key (also with literal \\n)', () => {
    const a = spki()
    assert.deepEqual(parseVirtualUserVerifyKeys(pem(a)), [{ publicKey: a }])
    assert.deepEqual(parseVirtualUserVerifyKeys(pem(a).replace(/\n/g, '\\n')), [
      { publicKey: a },
    ])
  })

  test('a JSON list, with or without a kid, with surrounding whitespace', () => {
    const [a, b] = [spki(), spki()]
    const text = `\n  ${JSON.stringify([{ kid: 'k1', publicKey: pem(a) }, { publicKey: b }])}  \n`
    assert.deepEqual(parseVirtualUserVerifyKeys(text), [
      { kid: 'k1', publicKey: a },
      { publicKey: b },
    ])
  })

  test('an already parsed list (the variables service JSON-parses) is accepted', () => {
    const a = spki()
    assert.deepEqual(parseVirtualUserVerifyKeys([{ kid: 'k', publicKey: a }]), [
      { kid: 'k', publicKey: a },
    ])
  })

  test('rejects an empty list', () => {
    assert.throws(() => parseVirtualUserVerifyKeys('[]'), /empty/)
    assert.throws(() => parseVirtualUserVerifyKeys([]), /empty/)
  })

  test('rejects malformed JSON', () => {
    assert.throws(() => parseVirtualUserVerifyKeys('[{'), /not valid JSON/)
  })

  test('rejects a non-array', () => {
    assert.throws(
      () => parseVirtualUserVerifyKeys({ kid: 'a', publicKey: spki() } as any),
      /list/
    )
    assert.throws(() => parseVirtualUserVerifyKeys(['x'] as any), /entry/)
    assert.throws(() => parseVirtualUserVerifyKeys([null] as any), /entry/)
  })

  test('rejects a duplicate kid and a duplicated key', () => {
    const [a, b] = [spki(), spki()]
    assert.throws(
      () =>
        parseVirtualUserVerifyKeys([
          { kid: 'k', publicKey: a },
          { kid: 'k', publicKey: b },
        ]),
      /duplicate kid/
    )
    assert.throws(
      () =>
        parseVirtualUserVerifyKeys([
          { kid: 'x', publicKey: a },
          { kid: 'y', publicKey: pem(a) },
        ]),
      /twice/
    )
  })

  test('rejects more than 4 keys, unknown fields, a bad kid and non-Ed25519 keys', () => {
    assert.throws(
      () =>
        parseVirtualUserVerifyKeys(
          Array.from({ length: 5 }, () => ({ publicKey: spki() }))
        ),
      /at most 4/
    )
    assert.throws(
      () =>
        parseVirtualUserVerifyKeys([{ publicKey: spki(), extra: 1 } as any]),
      /unknown field/
    )
    assert.throws(
      () => parseVirtualUserVerifyKeys([{ kid: '', publicKey: spki() }]),
      /kid/
    )
    assert.throws(() => parseVirtualUserVerifyKeys('not a key!'), /base64/)
    assert.throws(
      () =>
        parseVirtualUserVerifyKeys(
          generateKeyPairSync('rsa', { modulusLength: 2048 })
            .publicKey.export({ format: 'der', type: 'spki' })
            .toString('base64')
        ),
      /Ed25519/
    )
  })
})

describe('spkiToDer and the base64 helpers', () => {
  test('PEM, escaped PEM and bare base64 give the same DER; junk throws', () => {
    const key = generateKeyPairSync('ed25519').publicKey
    const der = key.export({ format: 'der', type: 'spki' })
    const pem = key.export({ format: 'pem', type: 'spki' }) as string
    assert.deepEqual(Buffer.from(spkiToDer(pem)), der)
    assert.deepEqual(Buffer.from(spkiToDer(pem.replace(/\n/g, '\\n'))), der)
    assert.deepEqual(Buffer.from(spkiToDer(der.toString('base64'))), der)
    assert.throws(() => spkiToDer('not a key!'))
  })

  test('bytesToBase64 and base64ToBytes round trip, url form is unpadded', () => {
    const bytes = Uint8Array.from([251, 255, 0, 1])
    assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes)
    assert.equal(bytesToBase64(bytes, true), '-_8AAQ')
  })
})
