import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { toScopeTreeRows } from './scope-tree.js'

const SCOPES = [
  { id: 'admin', declared: true },
  { id: 'admin:invoices', description: 'Invoice Management', declared: true },
  { id: 'admin:invoices:create', declared: true },
  { id: 'billing:read', declared: false },
]

describe('toScopeTreeRows', () => {
  test('depth counts the colon separators', () => {
    const rows = toScopeTreeRows(SCOPES)
    assert.deepEqual(
      rows.map((r) => r.depth),
      [0, 1, 2, 1]
    )
  })

  test('segment is the last id fragment', () => {
    const rows = toScopeTreeRows(SCOPES)
    assert.deepEqual(
      rows.map((r) => r.segment),
      ['admin', 'invoices', 'create', 'read']
    )
  })

  test('hasChildren is set only for a scope that others nest under', () => {
    const rows = toScopeTreeRows(SCOPES)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.hasChildren]))
    assert.equal(byId['admin'], true)
    assert.equal(byId['admin:invoices'], true)
    assert.equal(byId['admin:invoices:create'], false)
    assert.equal(byId['billing:read'], false)
  })

  test('a prefix that is not colon-delimited does not count as a child', () => {
    const rows = toScopeTreeRows([
      { id: 'admin', declared: true },
      { id: 'administrator', declared: true },
    ])
    assert.equal(rows.find((r) => r.id === 'admin')!.hasChildren, false)
  })

  test('input order and passthrough fields are preserved', () => {
    const rows = toScopeTreeRows(SCOPES)
    assert.deepEqual(
      rows.map((r) => r.id),
      SCOPES.map((s) => s.id)
    )
    assert.equal(rows[1]!.description, 'Invoice Management')
    assert.equal(rows[3]!.declared, false)
  })
})
