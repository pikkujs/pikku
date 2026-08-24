/**
 * Verifies the scopes feature end-to-end against real generated code:
 * compile-time narrowing of `scopes` to the generated ScopeId union, the
 * generated SCOPES set, the runtime verifyScopes gate, and the parts of the
 * ScopeService contract a store cannot opt out of — additive syncs and
 * system-role immutability.
 */

import * as assert from 'node:assert'
import { pikkuFunc } from '#pikku/function'
import { verifyScopes } from '@pikku/core/scope'
import { MissingScopeError } from '#pikku/error'
import {
  SystemRoleImmutableError,
  SystemRoleShadowedError,
} from '@pikku/core/errors'
import { InMemoryScopeService } from './scope-service.js'
import type { ScopeId } from '../.pikku/scopes/pikku-scopes.gen.js'
import { SCOPES, SCOPES_META } from '../.pikku/scopes/pikku-scopes.gen.js'

// ============================================================================
// Compile-time assertions — an undeclared scope must not type-check
// ============================================================================

void pikkuFunc<void, string>({
  // @ts-expect-error - 'billing:write' is not declared in scopes.ts
  scopes: ['billing:write'],
  func: async () => 'x',
})

void pikkuFunc<void, string>({
  // @ts-expect-error - typo: the declared scope is 'admin:invoices', not 'admin:invoice'
  scopes: ['admin:invoice:create'],
  func: async () => 'x',
})

void pikkuFunc<void, string>({
  // @ts-expect-error - 'admin:users' has no children, so it has no wildcard form
  scopes: ['admin:users:*'],
  func: async () => 'x',
})

void pikkuFunc<void, string>({
  // @ts-expect-error - the bare wildcard is a grant, never a requirement
  scopes: ['*'],
  func: async () => 'x',
})

// These are declared, so they must compile.
void ('admin' satisfies ScopeId)
void ('admin:invoices' satisfies ScopeId)
void ('admin:invoices:create' satisfies ScopeId)
void ('admin:invoices:void' satisfies ScopeId)
void ('admin:users' satisfies ScopeId)
void ('admin:*' satisfies ScopeId)
void ('admin:invoices:*' satisfies ScopeId)
void ('billing' satisfies ScopeId)
void ('billing:read' satisfies ScopeId)
void ('billing:*' satisfies ScopeId)

// ============================================================================
// Runtime assertions
// ============================================================================

const ids = SCOPES.map((s) => s.id).sort()

assert.deepEqual(
  ids,
  [
    'admin',
    'admin:invoices',
    'admin:invoices:create',
    'admin:invoices:void',
    'admin:users',
    'billing',
    'billing:read',
  ],
  'SCOPES must carry every declared node, and no wildcard forms'
)

assert.equal(
  SCOPES_META['admin:invoices:create']!.description,
  'Create invoices',
  'descriptions must survive codegen'
)
assert.equal(
  SCOPES_META['admin']!.displayName,
  'Administration',
  'displayName must survive codegen'
)

const session = (scopes: string[]) => ({ userId: 'u1', scopes })

// Exact grant.
verifyScopes(['admin:invoices:create'], session(['admin:invoices:create']))

// Wildcard grant covers the subtree and the node itself.
verifyScopes(['admin:invoices:create'], session(['admin:*']))
verifyScopes(['admin'], session(['admin:*']))

// AND semantics.
verifyScopes(
  ['admin:invoices:void', 'billing:read'],
  session(['admin:invoices:void', 'billing:read'])
)
assert.throws(
  () =>
    verifyScopes(
      ['admin:invoices:void', 'billing:read'],
      session(['admin:invoices:void'])
    ),
  MissingScopeError,
  'holding only one of two required scopes must fail'
)

// Wildcards do not leak across siblings.
assert.throws(
  () => verifyScopes(['billing:read'], session(['admin:*'])),
  MissingScopeError,
  'admin:* must not grant billing:read'
)

// A narrower grant does not satisfy a broader requirement.
assert.throws(
  () => verifyScopes(['admin'], session(['admin:invoices'])),
  MissingScopeError,
  'holding a child must not grant the parent'
)

// Fails closed.
assert.throws(
  () => verifyScopes(['admin'], { userId: 'u1' }),
  MissingScopeError,
  'a session with no scopes must satisfy nothing'
)

// The error names the missing scope.
assert.throws(
  () => verifyScopes(['billing:read'], session([])),
  (err: MissingScopeError) => {
    assert.equal(err.payload.scope, 'billing:read')
    return true
  }
)

// ============================================================================
// Store contract — the parts a ScopeService implementation cannot opt out of
// ============================================================================

{
  const service = new InMemoryScopeService()

  await service.syncScopes([{ id: 'admin' }, { id: 'billing:read' }])
  await service.syncSystemRoles([{ name: 'operator', scopes: ['admin'] }])

  // A system role may be granted, but never composed over, re-scoped or deleted.
  await assert.rejects(
    () => service.createRole({ name: 'operator', scopes: ['billing:read'] }),
    SystemRoleShadowedError,
    'createRole must not shadow a declared system role'
  )
  await assert.rejects(
    () => service.deleteRole('operator'),
    SystemRoleImmutableError,
    'deleteRole must refuse a system role'
  )
  await assert.rejects(
    () => service.setRoleScopes('operator', []),
    SystemRoleImmutableError,
    'setRoleScopes must refuse a system role'
  )
  assert.deepEqual(
    (await service.listRoles()).find((role) => role.name === 'operator')
      ?.scopes,
    ['admin'],
    'and a refused mutation must leave the role as declared'
  )

  // An admin-composed role of the same shape is fully mutable.
  await service.createRole({ name: 'auditor', scopes: ['billing:read'] })
  await service.setRoleScopes('auditor', ['admin'])
  assert.deepEqual(
    (await service.listRoles()).find((role) => role.name === 'auditor')?.scopes,
    ['admin']
  )
  await service.deleteRole('auditor')
  assert.equal(
    (await service.listRoles()).some((role) => role.name === 'auditor'),
    false
  )
}

{
  const service = new InMemoryScopeService()

  await service.syncScopes([{ id: 'admin' }, { id: 'billing:read' }])
  await service.createRole({ name: 'auditor', scopes: ['billing:read'] })
  await service.addScopeToUser('u1', 'billing:read')

  // Dropping a declaration marks the scope, it does not revoke it on deploy.
  await service.syncScopes([{ id: 'admin' }])
  assert.deepEqual(
    (await service.listScopes()).map((scope) => [scope.id, scope.declared]),
    [
      ['admin', true],
      ['billing:read', false],
    ],
    'an undeclared scope stays in the store, marked'
  )
  assert.deepEqual(await service.findStaleScopes(), [
    { scope: 'billing:read', roles: ['auditor'] },
  ])

  assert.deepEqual(await service.pruneScopes(), ['billing:read'])
  assert.deepEqual(await service.listUserScopes('u1'), [], 'pruning cascades')
  assert.deepEqual(
    (await service.listRoles()).find((role) => role.name === 'auditor')?.scopes,
    []
  )
  assert.deepEqual(await service.findStaleScopes(), [])
}

{
  const service = new InMemoryScopeService()

  await service.syncSystemRoles([
    { name: 'operator', scopes: [] },
    { name: 'buyer', scopes: [] },
  ])
  await service.addUserToRole('u1', 'buyer')

  await service.syncSystemRoles([{ name: 'operator', scopes: [] }])
  assert.deepEqual(await service.findStaleSystemRoles(), [
    { role: 'buyer', users: 1 },
  ])

  // Still immutable while it survives undeclared — pruning is the only removal.
  await assert.rejects(
    () => service.deleteRole('buyer'),
    SystemRoleImmutableError
  )

  assert.deepEqual(await service.pruneSystemRoles(), ['buyer'])
  assert.deepEqual(await service.listUserRoles('u1'), [])
  assert.deepEqual(await service.findStaleSystemRoles(), [])
}

console.log('✓ scopes: codegen, compile-time narrowing, and runtime gate')
console.log('✓ scopes: system-role immutability, stale scopes and stale roles')
