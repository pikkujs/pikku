import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  belongsToAddon,
  filterListByAddon,
  filterRecordByAddon,
  namespaceOf,
  pageOf,
} from './addon-scope.js'

test('the namespace is what precedes the first colon', () => {
  assert.equal(namespaceOf('spindle:library:list'), 'spindle')
  assert.equal(namespaceOf('plain'), undefined)
  assert.equal(namespaceOf(':odd'), undefined)
  assert.equal(namespaceOf(undefined), undefined)
})

test('with no addon everything belongs, namespaced or not', () => {
  assert.equal(belongsToAddon('plain', undefined), true)
  assert.equal(belongsToAddon('spindle:a', undefined), true)
  assert.equal(belongsToAddon('plain', ''), true)
})

test('with an addon only its own namespace belongs', () => {
  assert.equal(belongsToAddon('spindle:a', 'spindle'), true)
  assert.equal(belongsToAddon('plain', 'spindle'), false)
  assert.equal(belongsToAddon(undefined, 'spindle'), false)
})

test('an addon whose name merely starts with the same letters is not matched', () => {
  assert.equal(belongsToAddon('spindle2:a', 'spindle'), false)
  assert.equal(belongsToAddon('spin:a', 'spindle'), false)
  assert.equal(belongsToAddon('spindle:a', 'spin'), false)
})

test('lists and records filter by the same rule and pass through untouched without an addon', () => {
  const items = [{ n: 'a:x' }, { n: 'ab:x' }, { n: 'plain' }]
  assert.deepEqual(
    filterListByAddon(items, 'a', (i) => i.n),
    [{ n: 'a:x' }]
  )
  assert.equal(
    filterListByAddon(items, undefined, (i) => i.n),
    items
  )
  const record = { 'a:x': 1, 'ab:x': 2, plain: 3 }
  assert.deepEqual(filterRecordByAddon(record, 'a'), { 'a:x': 1 })
  assert.equal(filterRecordByAddon(record, undefined), record)
})

test('paging applies offset then limit', () => {
  assert.deepEqual(pageOf([1, 2, 3, 4], { offset: 1, limit: 2 }), [2, 3])
  assert.deepEqual(pageOf([1, 2, 3], undefined), [1, 2, 3])
  assert.deepEqual(pageOf([1, 2, 3], { offset: 2 }), [3])
})
