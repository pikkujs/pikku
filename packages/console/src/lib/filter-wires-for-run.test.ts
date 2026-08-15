import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { filterWiresForRun } from './filter-wires-for-run.js'

const wires = {
  http: [
    { method: 'POST', route: '/orders' },
    { method: 'GET', route: '/orders' },
  ],
  queue: [{ name: 'orders' }, { name: 'invoices' }],
  schedule: [{ cron: '0 * * * *' }, { interval: '5m' }],
  cli: [{ command: 'sync' }],
}

describe('filterWiresForRun', () => {
  test('keeps only the http wire the run came in on', () => {
    assert.deepEqual(
      filterWiresForRun(wires, { type: 'http', id: 'get:/orders' }),
      {
        http: [{ method: 'GET', route: '/orders' }],
      }
    )
  })

  test('defaults a missing method to get, matching how ids are minted', () => {
    assert.deepEqual(
      filterWiresForRun(
        { http: [{ route: '/health' }] },
        {
          type: 'http',
          id: 'get:/health',
        }
      ),
      { http: [{ route: '/health' }] }
    )
  })

  test('matches queues by name and clis by command', () => {
    assert.deepEqual(
      filterWiresForRun(wires, { type: 'queue', id: 'invoices' }),
      {
        queue: [{ name: 'invoices' }],
      }
    )
    assert.deepEqual(filterWiresForRun(wires, { type: 'cli', id: 'sync' }), {
      cli: [{ command: 'sync' }],
    })
  })

  test('matches a schedule on either cron or interval', () => {
    assert.deepEqual(
      filterWiresForRun(wires, { type: 'scheduler', id: '0 * * * *' }),
      { schedule: [{ cron: '0 * * * *' }] }
    )
    assert.deepEqual(
      filterWiresForRun(wires, { type: 'scheduler', id: '5m' }),
      {
        schedule: [{ interval: '5m' }],
      }
    )
  })

  test('keeps every wire of the type when the run carries no id', () => {
    assert.deepEqual(filterWiresForRun(wires, { type: 'queue' }), {
      queue: wires.queue,
    })
  })

  test('drops everything for a wire type the canvas cannot place', () => {
    assert.deepEqual(filterWiresForRun(wires, { type: 'channel', id: 'x' }), {})
  })

  test('returns nothing when the workflow has no wires of that type', () => {
    assert.deepEqual(
      filterWiresForRun({ queue: [] }, { type: 'http', id: 'get:/' }),
      {}
    )
  })

  // Characterises a live bug rather than the intent. `wireTypeToWiresKey` has
  // no 'mcp' entry, so `if (!wiresKey) return {}` returns before the mcp branch
  // underneath it can run — that branch is unreachable, and an MCP-triggered
  // run shows no wires at all on the canvas. Pinned as-is because this landed
  // in a refactor; fixing it is a behaviour change that wants its own issue.
  test('drops mcp wires entirely — the mcp branch is unreachable', () => {
    const mcpWires = {
      mcp: {
        tools: [{ name: 'search' }, { name: 'fetch' }],
        resources: [{ uri: 'file://a' }],
      },
    }
    assert.deepEqual(
      filterWiresForRun(mcpWires, { type: 'mcp', id: 'resources:file://a' }),
      {}
    )
  })
})
