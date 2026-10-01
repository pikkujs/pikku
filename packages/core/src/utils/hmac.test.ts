import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, createSign, generateKeyPairSync } from 'node:crypto'
import {
  hmacDigest,
  timingSafeStringEqual,
  verifyHmacSignature,
  verifyPublicKeySignature,
} from './hmac.js'

const body = '{"id":"evt_1"}'

describe('webhook signature helpers', () => {
  test('accepts the HMAC of the payload and refuses anything else', () => {
    const hex = createHmac('sha256', 'shh').update(body).digest('hex')
    assert.equal(hmacDigest('shh', 'sha256', body, 'hex'), hex)
    assert.equal(verifyHmacSignature('shh', hex, 'sha256', body, 'hex'), true)
    assert.equal(
      verifyHmacSignature('shh', '0'.repeat(64), 'sha256', body, 'hex'),
      false
    )
    assert.equal(
      verifyHmacSignature('shh', undefined, 'sha256', body, 'hex'),
      false
    )
  })

  test('decodes a hex or base64 secret before signing', () => {
    const key = Buffer.from('c2ho', 'base64')
    const b64 = createHmac('sha1', key).update(body).digest('base64')
    assert.equal(
      verifyHmacSignature('c2ho', b64, 'sha1', body, 'base64', 'base64'),
      true
    )
  })

  test('compares strings in constant time, including different lengths', () => {
    assert.equal(timingSafeStringEqual('shh', 'shh'), true)
    assert.equal(timingSafeStringEqual('shh', 'nope'), false)
  })

  test('verifies a public-key signature', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    })
    const signature = createSign('sha256')
      .update(body)
      .sign(privateKey, 'base64')
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    assert.equal(verifyPublicKeySignature(pem, signature, body), true)
    assert.equal(verifyPublicKeySignature(pem, signature, body + ' '), false)
    assert.equal(verifyPublicKeySignature(pem, 'garbage', body), false)
    assert.equal(verifyPublicKeySignature(pem, undefined, body), false)
  })
})
