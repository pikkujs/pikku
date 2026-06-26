import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { uuidv5, deriveInvocationId } from './workflow-invocation-id.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuidv5', () => {
  test('matches the canonical RFC 4122 v5 vector', () => {
    // www.example.com in the DNS namespace → known fixed UUID. Proves the
    // SHA-1 + version/variant bit-twiddling is a correct v5 implementation.
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
