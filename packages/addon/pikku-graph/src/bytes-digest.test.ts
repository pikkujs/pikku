import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes } from 'node:crypto'

import {
  decodeText,
  encodeBytes,
  fromBase64,
  fromHex,
  toBase64,
} from './bytes.js'
import { digestBytes, hashText, hmacText, md5 } from './digest.js'

const ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'] as const
const SAMPLES = [
  '',
  'abc',
  'The quick brown fox jumps over the lazy dog',
  'héllo wörld \u{1F600}',
  'x'.repeat(55),
  'x'.repeat(56),
  'x'.repeat(64),
  'x'.repeat(1000),
]

describe('digest matches node:crypto', () => {
  for (const algorithm of ALGORITHMS) {
    test(`${algorithm} hash`, async () => {
      for (const sample of SAMPLES) {
        for (const encoding of ['hex', 'base64'] as const) {
          assert.equal(
            await hashText(algorithm, sample, encoding),
            createHash(algorithm).update(sample).digest(encoding)
          )
        }
      }
    })

    test(`${algorithm} hmac, including an empty and an oversized key`, async () => {
      for (const key of ['', 'secret', 'k'.repeat(64), 'k'.repeat(200)]) {
        for (const sample of SAMPLES) {
          assert.equal(
            await hmacText(algorithm, key, sample, 'hex'),
            createHmac(algorithm, key).update(sample).digest('hex')
          )
        }
      }
    })
  }

  test('binary input of every block boundary', async () => {
    for (const size of [1, 63, 64, 65, 4096]) {
      const bytes = new Uint8Array(randomBytes(size))
      assert.deepEqual(
        Buffer.from(md5(bytes)),
        createHash('md5').update(bytes).digest()
      )
      assert.deepEqual(
        Buffer.from(await digestBytes('sha256', bytes)),
        createHash('sha256').update(bytes).digest()
      )
    }
  })
})

describe('byte encodings match Buffer', () => {
  const texts = [
    '',
    'hello',
    'héllo wörld \u{1F600}',
    '﻿bom',
    'a'.repeat(100000),
  ]

  test('utf8 <-> base64 <-> hex', () => {
    for (const text of texts) {
      const buf = Buffer.from(text)
      assert.equal(
        encodeBytes(decodeText(text), 'base64'),
        buf.toString('base64')
      )
      assert.equal(encodeBytes(decodeText(text), 'hex'), buf.toString('hex'))
      assert.equal(
        encodeBytes(decodeText(buf.toString('base64'), 'base64')),
        buf.toString('utf8')
      )
      assert.equal(
        encodeBytes(decodeText(buf.toString('hex'), 'hex')),
        buf.toString('utf8')
      )
    }
  })

  test('base64 decoding is as lenient as Buffer', () => {
    for (const input of ['aGk', 'aGk=', 'aG k\n=', '-_-_', 'a', 'abcde']) {
      assert.deepEqual(
        Buffer.from(fromBase64(input)),
        Buffer.from(input, 'base64'),
        input
      )
    }
    assert.equal(toBase64(new Uint8Array([0, 255, 128])), 'AP+A')
  })

  test('hex decoding stops at the first invalid pair, like Buffer', () => {
    for (const input of ['', 'ab', 'abc', 'abzz01', '0g', 'ABCDEF']) {
      assert.deepEqual(
        Buffer.from(fromHex(input)),
        Buffer.from(input, 'hex'),
        input
      )
    }
  })
})
