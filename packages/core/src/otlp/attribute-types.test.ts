import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { AttributeTypes } from './attribute-types.js'

describe('AttributeTypes', () => {
  test('allow-list keys start with their fixed type', () => {
    const types = new AttributeTypes()
    assert.deepEqual(types.coerce({ 'http.response.status_code': 200.4 }), {
      'http.response.status_code': 200,
    })
    assert.deepEqual(types.coerce({ 'pikku.function.id': 12 }), {
      'pikku.function.id': '12',
    })
  })

  test('an unknown key keeps the type it was first seen with', () => {
    const types = new AttributeTypes()
    assert.deepEqual(types.coerce({ n: 1 }), { n: 1 })
    assert.deepEqual(types.coerce({ n: 2.7 }), { n: 3 })
    assert.deepEqual(types.coerce({ n: '5' }), {})
    assert.equal(types.dropped, 1)
  })

  test('a whole number into a double column stays a double', () => {
    const types = new AttributeTypes()
    types.coerce({ ratio: 0.5 })
    assert.deepEqual(types.coerce({ ratio: 2 }), { ratio: { double: 2 } })
  })

  test('anything becomes a string where a string was first', () => {
    const types = new AttributeTypes()
    types.coerce({ label: 'a' })
    assert.deepEqual(types.coerce({ label: true }), { label: 'true' })
    assert.deepEqual(types.coerce({ label: 4 }), { label: '4' })
  })

  test('a bool column refuses a non-bool instead of inventing one', () => {
    const types = new AttributeTypes()
    types.coerce({ flag: true })
    assert.deepEqual(types.coerce({ flag: 'yes' }), {})
    assert.equal(types.dropped, 1)
  })

  test('a non-finite number is dropped', () => {
    const types = new AttributeTypes()
    assert.deepEqual(types.coerce({ n: Number.NaN }), {})
    assert.equal(types.dropped, 1)
  })

  test('keys built from data stop being tracked after 512', () => {
    const types = new AttributeTypes()
    for (let n = 0; n < 600; n++) types.coerce({ [`k${n}`]: 1 })
    assert.ok(types.dropped > 0)
  })
})
