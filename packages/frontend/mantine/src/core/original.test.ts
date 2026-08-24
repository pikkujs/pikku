import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modifiedStyles } from './original.js'

const marked = (result: ReturnType<typeof modifiedStyles>) => !!result.styles

test('a value matching the one it came from is not marked', () => {
  assert.equal(marked(modifiedStyles('realistic', 'realistic')), false)
  assert.equal(marked(modifiedStyles(6, 6)), false)
})

test('a value that has parted ways is marked', () => {
  assert.equal(marked(modifiedStyles('careless', 'realistic')), true)
})

// The values being compared are rebuilt every render — a goals array arrives as
// a new reference each time and is still the same list. A referential check
// would mark every field on a screen that had changed nothing.
test('equal lists from different renders are the same value', () => {
  assert.equal(marked(modifiedStyles(['a', 'b'], ['a', 'b'])), false)
  assert.equal(marked(modifiedStyles(['a', 'b'], ['b', 'a'])), true)
})

// `undefined` is how a caller says there is nothing to compare against, which
// every control without an `original` relies on to behave as Mantine's does.
test('no original means no comparison, whatever the value is', () => {
  assert.equal(marked(modifiedStyles('anything', undefined)), false)
  assert.equal(marked(modifiedStyles(undefined, undefined)), false)
})

// So a field whose original value is genuinely absent can still be marked once
// something is typed into it.
test('null is an original, so an absent value can still be marked', () => {
  assert.equal(marked(modifiedStyles('typed', null)), true)
  assert.equal(marked(modifiedStyles(null, null)), false)
})

// A toggle hides the input it would otherwise be bordered on, so the part being
// styled travels with the value rather than being fixed here.
test('the marked part is the caller choice', () => {
  assert.deepEqual(Object.keys(modifiedStyles(true, false).styles!), ['input'])
  assert.deepEqual(Object.keys(modifiedStyles(true, false, 'track').styles!), [
    'track',
  ])
})

test('NaN counts as unchanged against itself', () => {
  assert.equal(marked(modifiedStyles(Number.NaN, Number.NaN)), false)
})
