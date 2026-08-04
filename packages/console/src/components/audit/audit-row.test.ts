import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actorIdentity,
  actorLabel,
  actorName,
  auditRowKey,
  formatOccurredAt,
  summariseMetadata,
  type AuditRow,
} from './audit-row.js'

const row = (overrides: Partial<AuditRow> = {}): AuditRow => ({
  occurredAt: '2026-01-01T12:00:00.000Z',
  type: 'invoice.update',
  source: 'explicit',
  ...overrides,
})

describe('auditRowKey', () => {
  test('prefers the event id', () => {
    assert.equal(auditRowKey(row({ eventId: 'evt_1' }), 3), 'evt_1')
  })

  // The index alone is reused by the next page, which would remount every row
  // below the boundary on each fetch.
  test('falls back to a composite that stays unique across pages', () => {
    const first = auditRowKey(row(), 0)
    const second = auditRowKey(row(), 1)
    assert.notEqual(first, second)
    assert.match(first, /2026-01-01T12:00:00\.000Z/)
  })
})

describe('actorName', () => {
  test('prefers a name, then an email', () => {
    assert.equal(actorName({ name: 'Ada', email: 'ada@example.com' }), 'Ada')
    assert.equal(actorName({ email: 'ada@example.com' }), 'ada@example.com')
  })

  test('has nothing to say about an account with neither', () => {
    assert.equal(actorName({}), undefined)
    assert.equal(actorName(undefined), undefined)
  })

  // A row written by a since-deleted account is not an error, and rendering it
  // nameless would make the event look like nobody did it.
  test('falls back to the id the event was recorded under', () => {
    assert.equal(actorLabel('usr_1', { usr_2: { name: 'Ada' } }), 'usr_1')
    assert.equal(actorLabel('usr_1', undefined), 'usr_1')
  })
})

describe('actorIdentity', () => {
  test('names the account that acted', () => {
    assert.deepEqual(
      actorIdentity({ userId: 'usr_1' }, { usr_1: { name: 'Ada' } }),
      { kind: 'user', label: 'Ada', synthetic: false }
    )
  })

  test('marks a scenario actor so synthetic traffic is not read as real', () => {
    assert.deepEqual(
      actorIdentity(
        { userId: 'usr_1' },
        { usr_1: { name: 'Admin', synthetic: true } }
      ),
      { kind: 'user', label: 'Admin', synthetic: true }
    )
  })

  // Crediting a signed-out caller to the platform would hide that a stranger
  // did it, so the wire identity is shown instead.
  test('shows the wire identity when nobody was signed in', () => {
    assert.deepEqual(actorIdentity({ pikkuUserId: 'pk_9' }, {}), {
      kind: 'anonymous',
      label: 'pk_9',
    })
  })

  test('is the system only when the event carries no identity at all', () => {
    assert.deepEqual(actorIdentity(undefined, {}), { kind: 'system' })
    assert.deepEqual(actorIdentity({}, {}), { kind: 'system' })
  })
})

describe('formatOccurredAt', () => {
  test('renders a valid timestamp in the reader’s locale', () => {
    const formatted = formatOccurredAt('2026-01-01T12:00:00.000Z')
    assert.notEqual(formatted, '2026-01-01T12:00:00.000Z')
    assert.ok(formatted.length > 0)
    assert.doesNotMatch(formatted, /Invalid/)
  })

  test('passes an unparseable value straight through', () => {
    assert.equal(formatOccurredAt('not a date'), 'not a date')
  })
})

describe('summariseMetadata', () => {
  test('is empty for a missing payload', () => {
    assert.equal(summariseMetadata(undefined), '')
    assert.equal(summariseMetadata(null), '')
  })

  test('joins scalar entries', () => {
    assert.equal(
      summariseMetadata({ entity: 'invoice', entityId: 'inv-1' }),
      'entity: invoice, entityId: inv-1'
    )
  })

  test('does not flatten a nested object into the cell', () => {
    assert.equal(
      summariseMetadata({ before: { status: 'open' } }),
      'before: {…}'
    )
  })

  test('counts arrays rather than listing them', () => {
    assert.equal(summariseMetadata({ failures: [1, 2, 3] }), 'failures: [3]')
    assert.equal(summariseMetadata([1, 2]), '2 items')
  })

  test('marks a null value rather than printing "null"', () => {
    assert.equal(
      summariseMetadata({ demotedStageId: null }),
      'demotedStageId: —'
    )
  })

  test('renders a scalar payload as itself', () => {
    assert.equal(summariseMetadata('legacy text'), 'legacy text')
  })
})
