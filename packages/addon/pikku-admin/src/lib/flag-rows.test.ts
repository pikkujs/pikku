import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { flagRowsFromSource } from './flag-rows.js'

describe('flagRowsFromSource', () => {
  test('joins a declaration onto the provider row', () => {
    const [row] = flagRowsFromSource([{ name: 'sandboxes' }], {
      sandboxes: { enabled: false, rolloutPercent: 25, overrides: {} },
    })

    assert.equal(row?.enabled, false)
    assert.equal(row?.rolloutPercent, 25)
    assert.equal(row?.backed, true)
  })

  test('reports a declaration the provider never heard of as live', () => {
    const [row] = flagRowsFromSource([{ name: 'sandboxes' }], {})

    assert.equal(row?.backed, false)
    assert.equal(
      row?.enabled,
      true,
      'an absent row fails open, so the tab must not read it as off'
    )
  })

  test('ignores a provider flag nothing declares', () => {
    const rows = flagRowsFromSource([], {
      strayFlag: { enabled: true, rolloutPercent: null, overrides: {} },
    })

    assert.deepEqual(rows, [])
  })

  test('sorts by name', () => {
    const rows = flagRowsFromSource(
      [{ name: 'sandboxes' }, { name: 'nightlyReindex' }],
      {}
    )

    assert.deepEqual(
      rows.map((row) => row.name),
      ['nightlyReindex', 'sandboxes']
    )
  })
})
