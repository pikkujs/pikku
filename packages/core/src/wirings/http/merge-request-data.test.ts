import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeRequestData } from './merge-request-data.js'
import { UnprocessableContentError } from '../../errors/errors.js'

test('mergeRequestData merges params, query and body into one object', () => {
  const merged = mergeRequestData(
    { id: '42' },
    { page: '2' },
    { name: 'shoe', tags: ['a', 'b'] }
  )
  assert.deepEqual(merged, {
    id: '42',
    page: '2',
    name: 'shoe',
    tags: ['a', 'b'],
  })
})

test('mergeRequestData keeps the first value when a later part agrees', () => {
  const merged = mergeRequestData<Record<string, unknown>>(
    { id: '42', flag: 'true' },
    {},
    { id: 42, flag: true }
  )
  assert.equal(merged.id, '42')
  assert.equal(merged.flag, 'true')
})

test('mergeRequestData treats identical non-numeric strings as equal', () => {
  const merged = mergeRequestData({ slug: 'shoe' }, { slug: 'shoe' })
  assert.deepEqual(merged, { slug: 'shoe' })
})

test('mergeRequestData rejects conflicting values for the same key', () => {
  assert.throws(
    () => mergeRequestData({ id: '42' }, {}, { id: 43 }),
    (e: unknown) =>
      e instanceof UnprocessableContentError &&
      e.message === 'Conflicting values for key "id": "42" vs "43"'
  )
})

test('mergeRequestData rejects a string that differs from a boolean', () => {
  assert.throws(
    () => mergeRequestData({ flag: 'false' }, { flag: true }),
    UnprocessableContentError
  )
})

test('mergeRequestData compares objects by reference', () => {
  const tags = ['a']
  assert.deepEqual(mergeRequestData({ tags }, { tags }), { tags })
  assert.throws(
    () => mergeRequestData({ tags: ['a'] }, { tags: ['a'] }),
    UnprocessableContentError
  )
})

test('mergeRequestData drops prototype-polluting keys', () => {
  const body = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":1,"prototype":2,"ok":1}'
  )
  const merged = mergeRequestData<Record<string, unknown>>({}, {}, body)
  assert.deepEqual(Object.keys(merged), ['ok'])
  assert.equal(({} as Record<string, unknown>).polluted, undefined)
  assert.equal(Object.getPrototypeOf(merged), Object.prototype)
})
