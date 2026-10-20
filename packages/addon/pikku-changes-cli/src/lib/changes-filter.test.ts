import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { filterChanges } from './changes-filter.js'
import type { BoardChange } from './changes-board.js'

const make = (n: number, over: Record<string, unknown> = {}) =>
  ({
    changeId: `c${n}`,
    shortId: String(n),
    title: `change ${n}`,
    status: 'ready',
    specialist: 'build',
    ...over,
  }) as unknown as BoardChange

describe('filterChanges', () => {
  const many = [
    ...Array.from({ length: 60 }, (_, i) => make(i + 1)),
    make(100, { status: 'backlog', title: 'Seminarhof ship' }),
    make(101, { status: 'backlog', specialist: 'frontend', body: 'login switcher' }),
    make(102, { status: 'open' }),
  ]

  test('the cap is per column, so a full column never hides another', () => {
    const { shown, totals } = filterChanges(many, { cap: 50 })
    assert.equal(totals.ready, 61)
    assert.equal(totals.backlog, 2)
    assert.equal(shown.filter((c) => c.status === 'ready').length, 50)
    assert.equal(shown.filter((c) => c.status === 'backlog').length, 2)
  })

  test('status keeps only those columns and reads old open as ready', () => {
    const { shown } = filterChanges(many, { status: ['backlog'], cap: 50 })
    assert.deepEqual(shown.map((c) => c.shortId), ['100', '101'])
    const ready = filterChanges(many, { status: ['ready'], cap: Infinity })
    assert.equal(ready.shown.length, 61)
  })

  test('specialist and search narrow it, search reads title and body', () => {
    assert.deepEqual(
      filterChanges(many, { specialist: 'frontend', cap: 50 }).shown.map((c) => c.shortId),
      ['101']
    )
    assert.deepEqual(
      filterChanges(many, { search: 'SHIP', cap: 50 }).shown.map((c) => c.shortId),
      ['100']
    )
    assert.deepEqual(
      filterChanges(many, { search: 'switcher', cap: 50 }).shown.map((c) => c.shortId),
      ['101']
    )
  })

  test('totals count what matched, not what was shown', () => {
    const { shown, totals } = filterChanges(many, { search: 'change', cap: 5 })
    assert.equal(shown.filter((c) => c.status === 'ready').length, 5)
    assert.equal(totals.ready, 61)
  })
})
