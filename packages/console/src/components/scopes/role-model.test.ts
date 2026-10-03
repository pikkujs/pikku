import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  coveredPermissionCount,
  declaredPermissions,
  describeGrants,
  scopeName,
} from './role-model.js'

const SCOPES = [
  { id: 'admin', declared: true },
  { id: 'admin:audit', description: 'The audit trail', declared: true },
  { id: 'admin:audit:read', declared: true },
  { id: 'admin:flags', declared: true },
  { id: 'admin:flags:read', declared: true },
  { id: 'admin:flags:manage', declared: true },
  { id: 'admin:flags:manage:override', declared: true },
  { id: 'reports:read', declared: true },
  { id: 'billing:read', declared: false },
]

describe('scopeName', () => {
  test('reads each segment as a word, area first', () => {
    assert.equal(scopeName('admin:auditLog:read'), 'Admin › Audit Log › Read')
  })

  test('turns dashes and underscores into spaces', () => {
    assert.equal(scopeName('team-lead_invite'), 'Team lead invite')
  })
})

describe('declaredPermissions', () => {
  test('leaves out areas and groups that only hold other scopes', () => {
    assert.deepEqual(
      declaredPermissions(SCOPES).map((scope) => scope.id),
      [
        'admin:audit:read',
        'admin:flags:read',
        'admin:flags:manage',
        'admin:flags:manage:override',
        'reports:read',
      ]
    )
  })

  test('leaves out scopes no longer declared', () => {
    assert.equal(
      declaredPermissions(SCOPES).some((scope) => scope.id === 'billing:read'),
      false
    )
  })
})

describe('coveredPermissionCount', () => {
  test('a role with no grants allows nothing', () => {
    assert.equal(coveredPermissionCount([], SCOPES), 0)
  })

  test('a grant on an area covers every permission inside it', () => {
    assert.equal(coveredPermissionCount(['admin'], SCOPES), 4)
  })

  test('direct grants count once each', () => {
    assert.equal(
      coveredPermissionCount(['admin:flags:read', 'reports:read'], SCOPES),
      2
    )
  })

  test('a stale grant covers nothing', () => {
    assert.equal(coveredPermissionCount(['billing:read'], SCOPES), 0)
  })
})

describe('describeGrants', () => {
  test('marks an area grant, a single permission and a stale grant', () => {
    assert.deepEqual(
      describeGrants(['admin:audit', 'reports:read', 'billing:read'], SCOPES),
      [
        {
          id: 'admin:audit',
          name: 'Admin › Audit',
          description: 'The audit trail',
          wholeArea: true,
          stale: false,
        },
        {
          id: 'reports:read',
          name: 'Reports › Read',
          description: undefined,
          wholeArea: false,
          stale: false,
        },
        {
          id: 'billing:read',
          name: 'Billing › Read',
          description: undefined,
          wholeArea: false,
          stale: true,
        },
      ]
    )
  })
})
