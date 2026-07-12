import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { map } from './map.function.js'

const call = (data: any, wire: any) =>
  (map as any).func({}, data, wire)

describe('graph:map fan out', () => {
  test('invokes the child once per item, binding $item refs per element, ordered results', async () => {
    const calls: Array<{ step: string; rpc: string; data: any }> = []
    const workflow = {
      do: async (step: string, rpc: string, data: any) => {
        calls.push({ step, rpc, data })
        return { posted: data.url }
      },
    }

    const items = [
      { 'URL VIDEO': 'a.mp4', DESCRIPTION: 'first' },
      { 'URL VIDEO': 'b.mp4', DESCRIPTION: 'second' },
    ]

    const results = await call(
      {
        items,
        child: 'postVideo',
        stepPrefix: 'postAll',
        mode: 'parallel',
        childInput: {
          url: { $ref: '$item', path: 'URL VIDEO' },
          text: { $ref: '$item', path: 'DESCRIPTION' },
          campaign: 'launch',
        },
      },
      { workflow }
    )

    assert.deepEqual(results, [{ posted: 'a.mp4' }, { posted: 'b.mp4' }])
    assert.deepEqual(
      calls.map((c) => c.step),
      ['postAll#0', 'postAll#1']
    )
    assert.deepEqual(calls[0]!.data, {
      url: 'a.mp4',
      text: 'first',
      campaign: 'launch',
    })
    assert.deepEqual(calls[1]!.data, {
      url: 'b.mp4',
      text: 'second',
      campaign: 'launch',
    })
  })

  test('sequential mode preserves order and defaults stepPrefix to child', async () => {
    const order: number[] = []
    const workflow = {
      do: async (_step: string, _rpc: string, data: any) => {
        order.push(data.n)
        return data.n * 2
      },
    }

    const results = await call(
      {
        items: [{ n: 1 }, { n: 2 }, { n: 3 }],
        child: 'double',
        mode: 'sequential',
        childInput: { n: { $ref: '$item', path: 'n' } },
      },
      { workflow }
    )

    assert.deepEqual(results, [2, 4, 6])
    assert.deepEqual(order, [1, 2, 3])
  })

  test('throws when items is not an array', async () => {
    await assert.rejects(
      () =>
        call(
          { items: 'not-an-array', child: 'x' },
          { workflow: { do: async () => ({}) } }
        ),
      /expected an array to fan out over/
    )
  })

  test('throws when called outside a workflow', async () => {
    await assert.rejects(
      () => call({ items: [], child: 'x' }, {}),
      /can only be called from within a workflow/
    )
  })
})
