import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { transformDates } from './transform-date.js'

describe('transformDates', () => {
  test('revives a UTC instant', () => {
    const value = transformDates('2026-03-14T08:12:00.123Z')
    assert.ok(value instanceof Date)
    assert.equal(value.toISOString(), '2026-03-14T08:12:00.123Z')
  })

  test('revives a UTC instant without milliseconds', () => {
    const value = transformDates('2026-03-14T08:12:00Z')
    assert.ok(value instanceof Date)
    assert.equal(value.toISOString(), '2026-03-14T08:12:00.000Z')
  })

  test('revives an instant carrying a numeric offset', () => {
    const ahead = transformDates('2026-03-14T08:12:00+02:00')
    const behind = transformDates('2026-03-14T08:12:00.500-05:30')
    assert.ok(ahead instanceof Date)
    assert.ok(behind instanceof Date)
    assert.equal(ahead.toISOString(), '2026-03-14T06:12:00.000Z')
    assert.equal(behind.toISOString(), '2026-03-14T13:42:00.500Z')
  })

  test('leaves a bare calendar date alone', () => {
    // A `z.string()` field the server means as a calendar day. Reviving it
    // picks UTC midnight, which is the previous day for anyone west of
    // Greenwich, and hands `Date` to code the generated SDK typed `string`.
    assert.equal(transformDates('2026-03-14'), '2026-03-14')
  })

  test('leaves a zoneless date-time alone', () => {
    // No zone means no instant: `new Date` would resolve this in whichever
    // timezone the browser happens to sit in.
    assert.equal(transformDates('2026-03-14T08:12:00'), '2026-03-14T08:12:00')
    assert.equal(
      transformDates('2026-03-14T08:12:00.123'),
      '2026-03-14T08:12:00.123'
    )
  })

  test('leaves a string that merely starts with a date alone', () => {
    assert.equal(transformDates('2026-03-14-invoice-7'), '2026-03-14-invoice-7')
    assert.equal(
      transformDates('2026-03-14T08:12:00Z request finished'),
      '2026-03-14T08:12:00Z request finished'
    )
  })

  test('leaves an instant-shaped string that is not a real time alone', () => {
    assert.equal(transformDates('2026-02-31T25:99:00Z'), '2026-02-31T25:99:00Z')
  })

  test('leaves non-date primitives alone', () => {
    assert.equal(transformDates('hello'), 'hello')
    assert.equal(transformDates(42), 42)
    assert.equal(transformDates(true), true)
    assert.equal(transformDates(undefined), undefined)
  })

  test('returns null for null', () => {
    assert.equal(transformDates(null), null)
  })

  test('walks nested objects and arrays', () => {
    const result = transformDates({
      id: '2026-03-14-invoice-7',
      dueOn: '2026-03-14',
      createdAt: '2026-03-14T08:12:00Z',
      deletedAt: null,
      lines: [
        { at: '2026-03-15T09:00:00.000Z', note: 'first' },
        { at: '2026-03-16T09:00:00+01:00', note: null },
      ],
      stamps: ['2026-03-17T00:00:00Z', '2026-03-17'],
    })

    assert.equal(result.id, '2026-03-14-invoice-7')
    assert.equal(result.dueOn, '2026-03-14')
    assert.ok(result.createdAt instanceof Date)
    assert.equal(result.deletedAt, null)
    assert.ok(result.lines[0].at instanceof Date)
    assert.equal(result.lines[0].note, 'first')
    assert.ok(result.lines[1].at instanceof Date)
    assert.equal(result.lines[1].note, null)
    assert.ok(result.stamps[0] instanceof Date)
    assert.equal(result.stamps[1], '2026-03-17')
  })
})
