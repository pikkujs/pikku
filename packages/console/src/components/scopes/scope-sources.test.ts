import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { ScopeDefinitionsMeta } from '@pikku/core/scope'
import {
  NO_ROLE,
  filterScopes,
  groupScopesBySource,
  sourcePermissionCount,
} from './scope-sources'

const scope = (id: string, declared = true) => ({ id, declared })

const meta: ScopeDefinitionsMeta = {
  reports: {
    name: 'reports',
    displayName: 'Reports',
    origin: { kind: 'app' },
  },
  app: { name: 'app', origin: { kind: 'generated' } },
  admin: {
    name: 'admin',
    displayName: 'Administration',
    origin: {
      kind: 'addon',
      package: '@pikku/addon-admin',
      displayName: 'Pikku Admin',
    },
  },
  pikku: {
    name: 'pikku',
    origin: {
      kind: 'addon',
      package: '@pikku/addon-console',
      displayName: 'Pikku Console',
    },
  },
  stripe: {
    name: 'stripe',
    origin: { kind: 'addon', package: '@acme/addon-stripe' },
  },
  billing: {
    name: 'billing',
    origin: { kind: 'addon', package: '@acme/addon-stripe' },
  },
}

describe('groupScopesBySource', () => {
  const sources = groupScopesBySource(
    [
      scope('admin:users:list'),
      scope('billing:read'),
      scope('pikku:console:read'),
      scope('stripe:refunds'),
      scope('app:staff'),
      scope('reports:read'),
      scope('legacy:thing', false),
      scope('mystery:read'),
    ],
    meta
  )

  test("puts the app's own first, then pikku's, then addons, then the rest", () => {
    assert.deepEqual(
      sources.map((source) => source.key),
      [
        'app',
        'generated',
        'addon:@pikku/addon-admin',
        'addon:@pikku/addon-console',
        'addon:@acme/addon-stripe',
        'other',
        'removed',
      ]
    )
  })

  test('gives an addon that declares two trees one source', () => {
    const stripe = sources.find(
      (source) => source.key === 'addon:@acme/addon-stripe'
    )!
    assert.deepEqual(stripe.areas.map((area) => area.id).sort(), [
      'billing',
      'stripe',
    ])
    assert.equal(sourcePermissionCount(stripe), 2)
  })

  test("carries a root's display name onto its area", () => {
    const admin = sources.find(
      (source) => source.key === 'addon:@pikku/addon-admin'
    )!
    assert.equal(admin.areas[0]!.displayName, 'Administration')
  })

  test('sets a tree nothing declares any more apart from one it cannot place', () => {
    const removed = sources.find((source) => source.kind === 'removed')!
    const other = sources.find((source) => source.kind === 'other')!
    assert.deepEqual(
      removed.areas.map((area) => area.id),
      ['legacy']
    )
    assert.deepEqual(
      other.areas.map((area) => area.id),
      ['mystery']
    )
  })

  test('sorts third-party addons by name after pikku’s own', () => {
    const order = groupScopesBySource(
      [scope('zeta:a'), scope('alpha:a'), scope('admin:a')],
      {
        zeta: {
          name: 'zeta',
          origin: { kind: 'addon', package: '@x/zeta', displayName: 'Zeta' },
        },
        alpha: {
          name: 'alpha',
          origin: { kind: 'addon', package: '@x/alpha', displayName: 'Alpha' },
        },
        admin: meta['admin']!,
      }
    ).map((source) => source.key)
    assert.deepEqual(order, [
      'addon:@pikku/addon-admin',
      'addon:@x/alpha',
      'addon:@x/zeta',
    ])
  })
})

describe('filterScopes', () => {
  const scopes = [
    { id: 'admin', declared: true },
    { id: 'admin:users', declared: true, description: 'User directory' },
    { id: 'admin:users:list', declared: true, description: 'List users' },
    { id: 'admin:users:ban', declared: true, description: 'Ban users' },
    { id: 'reports', declared: true },
    { id: 'reports:read', declared: true, description: 'Read reports' },
  ]
  const roles = [
    { name: 'support', scopes: ['admin:users:list'] },
    { name: 'report-viewer', scopes: ['reports'] },
  ]
  const ids = (list: Array<{ id: string }>) => list.map((scope) => scope.id)

  test('keeps the headings above a search match', () => {
    assert.deepEqual(ids(filterScopes(scopes, { search: 'ban', role: null })), [
      'admin',
      'admin:users',
      'admin:users:ban',
    ])
  })

  test('keeps what a role is given, through a parent grant too', () => {
    assert.deepEqual(
      ids(filterScopes(scopes, { search: '', role: 'report-viewer', roles })),
      ['reports', 'reports:read']
    )
  })

  test('keeps what no role is given', () => {
    assert.deepEqual(
      ids(filterScopes(scopes, { search: '', role: NO_ROLE, roles })),
      ['admin', 'admin:users', 'admin:users:ban']
    )
  })

  test('combines the search and the role', () => {
    assert.deepEqual(
      ids(filterScopes(scopes, { search: 'users', role: 'support', roles })),
      ['admin', 'admin:users', 'admin:users:list']
    )
  })
})
