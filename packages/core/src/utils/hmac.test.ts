import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, createSign, generateKeyPairSync, sign } from 'node:crypto'
import {
  hmacDigest,
  timingSafeStringEqual,
  verifyHmacSignature,
  verifyPublicKeySignature,
} from './hmac.js'

const body = '{"id":"evt_1"}'

describe('webhook signature helpers', () => {
  test('accepts the HMAC of the payload and refuses anything else', async () => {
    const hex = createHmac('sha256', 'shh').update(body).digest('hex')
    assert.equal(await hmacDigest('shh', 'sha256', body, 'hex'), hex)
    assert.equal(
      await verifyHmacSignature('shh', hex, 'sha256', body, 'hex'),
      true
    )
    assert.equal(
      await verifyHmacSignature('shh', '0'.repeat(64), 'sha256', body, 'hex'),
      false
    )
    assert.equal(
      await verifyHmacSignature('shh', undefined, 'sha256', body, 'hex'),
      false
    )
  })

  test('decodes a hex or base64 secret before signing', async () => {
    const key = Buffer.from('c2ho', 'base64')
    const b64 = createHmac('sha1', key).update(body).digest('base64')
    assert.equal(
      await verifyHmacSignature('c2ho', b64, 'sha1', body, 'base64', 'base64'),
      true
    )
  })

  test('compares strings in constant time, including different lengths', () => {
    assert.equal(timingSafeStringEqual('shh', 'shh'), true)
    assert.equal(timingSafeStringEqual('shh', 'nope'), false)
  })

  test('verifies a public-key signature', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    })
    const signature = createSign('sha256')
      .update(body)
      .sign(privateKey, 'base64')
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    assert.equal(await verifyPublicKeySignature(pem, signature, body), true)
    assert.equal(
      await verifyPublicKeySignature(pem, signature, body + ' '),
      false
    )
    assert.equal(await verifyPublicKeySignature(pem, 'garbage', body), false)
    assert.equal(await verifyPublicKeySignature(pem, undefined, body), false)
  })
})

describe('parity with node:crypto', () => {
  test('hmacDigest matches createHmac across algorithms, encodings and payloads', async () => {
    const secrets = ['', 'shh', 'ключ-🔑', 'x'.repeat(200)]
    const payloads: Array<string | Uint8Array> = [
      '',
      body,
      'héllo wörld ✓',
      new Uint8Array([0, 1, 2, 250, 255]),
    ]
    for (const secret of secrets) {
      for (const payload of payloads) {
        for (const algorithm of ['sha1', 'sha256', 'sha512'] as const) {
          for (const encoding of ['hex', 'base64'] as const) {
            assert.equal(
              await hmacDigest(secret, algorithm, payload, encoding),
              createHmac(algorithm, secret).update(payload).digest(encoding)
            )
          }
        }
      }
    }
  })

  test('hex and base64 secrets decode like Buffer.from', async () => {
    for (const [secret, encoding] of [
      ['deadbeef00ff', 'hex'],
      ['deadbeefz', 'hex'],
      ['c2VjcmV0LWtleQ==', 'base64'],
      ['c2VjcmV0LWtleQ', 'base64'],
      ['c2VjcmV0_-tleQ', 'base64'],
    ] as const) {
      assert.equal(
        await hmacDigest(secret, 'sha256', body, 'hex', encoding),
        createHmac('sha256', Buffer.from(secret, encoding))
          .update(body)
          .digest('hex'),
        `${encoding} ${secret}`
      )
    }
  })

  test('timingSafeStringEqual agrees with string equality', () => {
    for (const [a, b] of [
      ['', ''],
      ['a', 'a'],
      ['a', 'b'],
      ['abc', 'ab'],
      ['é', 'é'],
      ['é', 'e'],
    ] as const) {
      assert.equal(timingSafeStringEqual(a, b), a === b)
    }
  })

  test('verifies RSA and other EC public-key signatures', async () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const rsaPem = rsa.publicKey.export({ type: 'spki', format: 'pem' })
    for (const algorithm of ['sha1', 'sha256', 'RSA-SHA512']) {
      const sig = createSign(algorithm)
        .update(body)
        .sign(rsa.privateKey, 'base64')
      assert.equal(
        await verifyPublicKeySignature(rsaPem.toString(), sig, body, {
          algorithm,
        }),
        true
      )
      assert.equal(
        await verifyPublicKeySignature(rsaPem.toString(), sig, body + 'x', {
          algorithm,
        }),
        false
      )
    }
    for (const namedCurve of ['secp384r1', 'secp521r1']) {
      const ec = generateKeyPairSync('ec', { namedCurve })
      const pem = ec.publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString()
      const algorithm = namedCurve === 'secp384r1' ? 'sha384' : 'sha512'
      for (const dsaEncoding of ['der', 'ieee-p1363'] as const) {
        for (let i = 0; i < 5; i++) {
          const sig = createSign(algorithm)
            .update(body)
            .sign({ key: ec.privateKey, dsaEncoding }, 'base64')
          assert.equal(
            await verifyPublicKeySignature(pem, sig, body, {
              algorithm,
              dsaEncoding,
            }),
            true,
            `${namedCurve} ${dsaEncoding}`
          )
        }
      }
    }
  })

  test('fails closed on an empty secret, even over an empty-key signature', async () => {
    for (const algorithm of ['sha1', 'sha256', 'sha512'] as const) {
      const hex = createHmac(algorithm, '').update(body).digest('hex')
      assert.equal(
        await verifyHmacSignature('', hex, algorithm, body, 'hex'),
        false
      )
      assert.equal(
        await verifyHmacSignature('', undefined, algorithm, body, 'hex'),
        false
      )
    }
    const b64 = createHmac('sha256', '').update(body).digest('base64')
    assert.equal(
      await verifyHmacSignature('', b64, 'sha256', body, 'base64'),
      false
    )
    // A secret that decodes to no key bytes is empty too.
    const zeroKey = createHmac('sha256', Buffer.alloc(0))
      .update(body)
      .digest('hex')
    assert.equal(
      await verifyHmacSignature('zz', zeroKey, 'sha256', body, 'hex', 'hex'),
      false
    )
  })

  test('rejects malformed or wrong-length signatures', async () => {
    const hex = createHmac('sha256', 'shh').update(body).digest('hex')
    for (const bad of [
      hex.slice(0, -2),
      hex + '00',
      hex + 'z',
      hex.slice(0, -1),
      'zz',
    ]) {
      assert.equal(
        await verifyHmacSignature('shh', bad, 'sha256', body, 'hex'),
        false
      )
    }
  })

  test('verifies an Ed25519 signature', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const signature = sign(null, Buffer.from(body), privateKey).toString(
      'base64'
    )
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    assert.equal(await verifyPublicKeySignature(pem, signature, body), true)
    assert.equal(
      await verifyPublicKeySignature(pem, signature, body + ' '),
      false
    )
    assert.equal(await verifyPublicKeySignature(pem, 'garbage', body), false)
    assert.equal(await verifyPublicKeySignature('', signature, body), false)
  })
})
