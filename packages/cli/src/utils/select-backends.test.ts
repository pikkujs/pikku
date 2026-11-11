import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertBackendToServe, selectBackends } from './select-backends.js'

test('selects every declared backend, or the one named', () => {
  assert.deepEqual(selectBackends({ a: {}, b: {} }), ['a', 'b'])
  assert.deepEqual(selectBackends({ a: {}, b: {} }, 'b'), ['b'])
})

test('no backends selects none, and naming one lists (none)', () => {
  assert.deepEqual(selectBackends(undefined), [])
  assert.throws(() => selectBackends({}, 'a'), /Declared backends: \(none\)/)
})

test('pikku serve with no backend errors, except for an addon', () => {
  assert.throws(() => assertBackendToServe({}), /no backend to serve/)
  assert.throws(() => assertBackendToServe({ backends: {} }), /no backend/)
  assert.doesNotThrow(() => assertBackendToServe({ backends: { api: {} } }))
  assert.doesNotThrow(() => assertBackendToServe({ addon: true }))
})
