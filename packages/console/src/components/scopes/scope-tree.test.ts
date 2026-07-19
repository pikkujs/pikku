import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isScopeRowDisabled,
  isScopeSelected,
  isScopeLockedByAncestor,
  toggleScope,
  diffScopeSelection,
  toScopeTreeRows,
} from './scope-tree.js'

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

describe('isScopeRowDisabled', () => {
  test('a declared scope is toggleable', () => {
    assert.equal(isScopeRowDisabled({ declared: true }, false, false), false)
    assert.equal(isScopeRowDisabled({ declared: true }, true, false), false)
  })

  test('an undeclared scope that is not held cannot be granted', () => {
    assert.equal(isScopeRowDisabled({ declared: false }, false, false), true)
  })

  // The stale grant must stay removable — otherwise a scope the system itself
  // flags as stale could never be revoked from the UI.
  test('an undeclared scope that is already held stays removable', () => {
    assert.equal(isScopeRowDisabled({ declared: false }, true, false), false)
  })

  test('a disabled tree locks every row regardless of state', () => {
    assert.equal(isScopeRowDisabled({ declared: true }, true, true), true)
    assert.equal(isScopeRowDisabled({ declared: false }, true, true), true)
  })
})

describe('isScopeSelected', () => {
  test('a directly-granted scope is selected', () => {
    assert.equal(isScopeSelected(['admin'], 'admin'), true)
  })

  test('a child under a granted parent is selected', () => {
    assert.equal(isScopeSelected(['admin'], 'admin:invoices:create'), true)
  })

  test('a parent is not selected by a granted child', () => {
    assert.equal(isScopeSelected(['admin:invoices'], 'admin'), false)
  })

  test('a colon prefix that is not a path segment does not count', () => {
    assert.equal(isScopeSelected(['admin'], 'administrator'), false)
  })
})

describe('isScopeLockedByAncestor', () => {
  test('a child under a granted parent is locked', () => {
    assert.equal(isScopeLockedByAncestor(['admin'], 'admin:invoices'), true)
  })

  test('the granted scope itself is not locked', () => {
    assert.equal(isScopeLockedByAncestor(['admin'], 'admin'), false)
  })

  test('an ungoverned scope is not locked', () => {
    assert.equal(isScopeLockedByAncestor(['admin'], 'billing:read'), false)
  })
})

describe('toggleScope', () => {
  test('granting a scope adds it', () => {
    assert.deepEqual(toggleScope([], 'admin'), ['admin'])
  })

  test('ungranting a directly-held scope removes it', () => {
    assert.deepEqual(toggleScope(['admin'], 'admin'), [])
  })

  test('granting a parent drops descendants it now subsumes', () => {
    assert.deepEqual(
      toggleScope(['admin:invoices', 'admin:invoices:create'], 'admin'),
      ['admin']
    )
  })

  test('a scope locked by an ancestor cannot be toggled', () => {
    assert.deepEqual(toggleScope(['admin'], 'admin:invoices'), ['admin'])
  })
})

describe('diffScopeSelection', () => {
  test('reports the added and removed scopes', () => {
    assert.deepEqual(diffScopeSelection(['a', 'b'], ['b', 'c']), {
      added: ['c'],
      removed: ['a'],
    })
  })

  test('granting a parent adds it and removes the subsumed child', () => {
    assert.deepEqual(diffScopeSelection(['admin:invoices'], ['admin']), {
      added: ['admin'],
      removed: ['admin:invoices'],
    })
  })
})
