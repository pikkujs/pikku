import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import { uuidv5, deriveInvocationId } from './workflow-invocation-id.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuidv5', () => {
  test('matches the canonical RFC 4122 v5 vector', () => {
    const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
    assert.equal(
      uuidv5('www.example.com', DNS),
      '2ed6657d-e927-568b-95e1-2665a8aea6a2'
    )
  })

  test('is deterministic and sets version 5 + RFC variant bits', () => {
    const a = uuidv5('hello')
    const b = uuidv5('hello')
    assert.equal(a, b, 'same input → same UUID')
    assert.match(a, UUID_RE, 'version nibble is 5 and variant is 8/9/a/b')
  })

  test('different names produce different UUIDs', () => {
    assert.notEqual(uuidv5('a'), uuidv5('b'))
  })
})

describe('deriveInvocationId', () => {
  test('is stable across calls for the same run + step (the dedupe key)', () => {
    const id1 = deriveInvocationId('run-1', 'updateUser')
    const id2 = deriveInvocationId('run-1', 'updateUser')
    assert.equal(id1, id2)
    assert.match(id1, UUID_RE)
  })

  test('differs per step name within a run', () => {
    assert.notEqual(
      deriveInvocationId('run-1', 'updateUser'),
      deriveInvocationId('run-1', 'chargeCard')
    )
  })

  test('differs per run for the same step name', () => {
    assert.notEqual(
      deriveInvocationId('run-1', 'updateUser'),
      deriveInvocationId('run-2', 'updateUser')
    )
  })
})

// The implementation this module shipped with, kept as the byte-for-byte
// reference: derived IDs are dedupe keys, so they must never change.
const oldUuidv5 = (name: string, namespace: string): string => {
  const hash = createHash('sha1')
    .update(Buffer.from(namespace.replace(/-/g, ''), 'hex'))
    .update(name, 'utf8')
    .digest()
  const bytes = hash.subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

describe('uuidv5 parity with the node:crypto implementation', () => {
  const NS = '70696b6b-7500-5770-9f6c-6f77000a0001'
  const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

  test('matches for every length around the SHA-1 block boundaries', () => {
    for (let len = 0; len <= 200; len++) {
      const name = 'a'.repeat(len)
      assert.equal(uuidv5(name), oldUuidv5(name, NS), `length ${len}`)
      assert.equal(uuidv5(name, DNS), oldUuidv5(name, DNS), `dns ${len}`)
    }
  })

  test('matches for random and non-ASCII names', () => {
    let seed = 12345
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff)
    for (let i = 0; i < 2000; i++) {
      const len = rand() % 300
      let name = ''
      for (let j = 0; j < len; j++)
        name += String.fromCodePoint(rand() % 0xd000)
      assert.equal(uuidv5(name), oldUuidv5(name, NS))
    }
    for (const name of ['', 'héllo', '日本語', '🔑 emoji', 'run-1:step\n']) {
      assert.equal(uuidv5(name), oldUuidv5(name, NS))
    }
  })
})
