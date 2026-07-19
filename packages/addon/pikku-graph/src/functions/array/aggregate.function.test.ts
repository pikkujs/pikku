import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { aggregate } from './aggregate.function.js'

const call = (data: any) => (aggregate as any).func({}, data)

describe('graph:aggregate', () => {
  test('single-field mode collects one field into a list', async () => {
    const out = await call({
      items: [{ name: 'a' }, { name: 'b' }],
      field: 'name',
      outputField: 'names',
    })
    assert.deepEqual(out, { item: { names: ['a', 'b'] } })
  })

  test('multi-field mode collects several fields at once', async () => {
    const out = await call({
      items: [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ],
      fields: [{ field: 'a' }, { field: 'b', outputField: 'bs' }],
    })
    assert.deepEqual(out, { item: { a: [1, 3], bs: [2, 4] } })
  })

  test('whole-item mode collects the entire items into one field (n8n aggregateAllItemData)', async () => {
    const items = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]
    const out = await call({
      items,
      includeAllItems: true,
      outputField: 'data',
    })
    assert.deepEqual(out, { item: { data: items } })
  })

  test('whole-item mode defaults the output field to "data"', async () => {
    const items = [{ x: 1 }]
    const out = await call({ items, includeAllItems: true })
    assert.deepEqual(out, { item: { data: items } })
  })
})
