import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { concat } from './concat.function.js'

const call = (data: any) => (concat as any).func({}, data)

describe('graph:concat', () => {
  test('concatenates two array streams in order', async () => {
    const out = await call({
      inputs: [[{ id: 1 }, { id: 2 }], [{ id: 3 }]],
    })
    assert.deepEqual(out, { items: [{ id: 1 }, { id: 2 }, { id: 3 }] })
  })

  test('wraps non-array inputs (a single object counts as one item)', async () => {
    const out = await call({
      inputs: [{ a: 1 }, [{ b: 2 }, { b: 3 }]],
    })
    assert.deepEqual(out, { items: [{ a: 1 }, { b: 2 }, { b: 3 }] })
  })

  test('an empty input list yields an empty stream', async () => {
    const out = await call({ inputs: [] })
    assert.deepEqual(out, { items: [] })
  })
})
