import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { flagRowsFromSource, flagRowsFromStore } from './flag-rows.js'

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

describe('flagRowsFromStore', () => {
  const stored = {
    name: 'sandboxes',
    enabled: false,
    rolloutPercent: 25,
    declared: true,
  }

  test('keeps a stored row as it is', () => {
    const [row] = flagRowsFromStore([{ name: 'sandboxes' }], [stored])

    assert.equal(row?.enabled, false)
    assert.equal(row?.rolloutPercent, 25)
    assert.equal(row?.backed, true)
  })

  test('lists a declaration with no row as live and unbacked', () => {
    const rows = flagRowsFromStore(
      [{ name: 'devSwitcher', description: 'Sign in as' }],
      []
    )

    assert.deepEqual(rows, [
      {
        name: 'devSwitcher',
        description: 'Sign in as',
        enabled: true,
        rolloutPercent: null,
        declared: true,
        backed: false,
      },
    ])
  })

  test('keeps a row whose declaration has gone', () => {
    const rows = flagRowsFromStore([], [{ ...stored, declared: false }])

    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.declared, false)
    assert.equal(rows[0]?.backed, true)
  })

  test('sorts rows and declarations together', () => {
    const rows = flagRowsFromStore([{ name: 'alpha' }], [stored])

    assert.deepEqual(
      rows.map((row) => row.name),
      ['alpha', 'sandboxes']
    )
  })
})
