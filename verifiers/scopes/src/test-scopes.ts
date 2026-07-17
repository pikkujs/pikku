/**
 * Verifies the scopes feature end-to-end against real generated code:
 * compile-time narrowing of `scopes` to the generated ScopeId union, the
 * generated SCOPES set, and the runtime verifyScopes gate.
 */

import * as assert from 'node:assert'
import { pikkuSessionlessFunc } from '#pikku'
import { verifyScopes } from '@pikku/core'
import { MissingScopeError } from '@pikku/core/errors'
import type { ScopeId } from '../.pikku/scopes/pikku-scopes.gen.js'
import { SCOPES, SCOPES_META } from '../.pikku/scopes/pikku-scopes.gen.js'

// ============================================================================
// Compile-time assertions — an undeclared scope must not type-check
// ============================================================================

void pikkuSessionlessFunc<void, string>({
  // @ts-expect-error - 'billing:write' is not declared in scopes.ts
  scopes: ['billing:write'],
  func: async () => 'x',
})

void pikkuSessionlessFunc<void, string>({
  // @ts-expect-error - typo: the declared scope is 'admin:invoices', not 'admin:invoice'
  scopes: ['admin:invoice:create'],
  func: async () => 'x',
})

void pikkuSessionlessFunc<void, string>({
  // @ts-expect-error - 'admin:users' has no children, so it has no wildcard form
  scopes: ['admin:users:*'],
  func: async () => 'x',
})

void pikkuSessionlessFunc<void, string>({
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

console.log('✓ scopes: codegen, compile-time narrowing, and runtime gate')
