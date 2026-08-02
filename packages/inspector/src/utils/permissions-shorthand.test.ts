import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import * as ts from 'typescript'
import { extractPermissionPikkuNames } from './permissions.js'

/**
 * A checker stub. With no symbols to resolve, every reference falls back to a
 * deterministic `__temp_` id — which is fine, because the question here is
 * whether a declared permission is *seen*, not what it resolves to. A dropped
 * property yields nothing at all, and that is the bug being pinned.
 */
const checker = {
  getSymbolAtLocation: () => undefined,
  getAliasedSymbol: () => undefined,
  getShorthandAssignmentValueSymbol: () => undefined,
} as unknown as ts.TypeChecker

/** Parses `permissions: <expr>` and counts the references the inspector records. */
const countFor = (permissionsExpression: string): number => {
  const file = ts.createSourceFile(
    'fn.ts',
    `const config = { permissions: ${permissionsExpression} }`,
    ts.ScriptTarget.Latest,
    true
  )
  let node: ts.Expression | undefined
  const visit = (n: ts.Node) => {
    if (
      ts.isPropertyAssignment(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'permissions'
    ) {
      node = n.initializer
    }
    ts.forEachChild(n, visit)
  }
  visit(file)
  assert.ok(node, 'failed to find the permissions node')
  return extractPermissionPikkuNames(node, checker, '/root').length
}

describe('extractPermissionPikkuNames', () => {
  test('records a permission declared with object shorthand', () => {
    // `permissions: { canAdminOrg }` is enforced identically to the longhand
    // form at runtime — verifyPermissions has a non-array branch — but was
    // dropped here, so meta reported a guarded function as carrying no
    // permissions at all. An audit reading meta saw an open door where one
    // was shut.
    assert.equal(countFor('{ canAdminOrg }'), 1)
  })

  test('records the longhand form', () => {
    assert.equal(countFor('{ org: canAdminOrg }'), 1)
  })

  test('records shorthand and longhand together', () => {
    assert.equal(countFor('{ canAdminOrg, billing: canBill }'), 2)
  })

  test('records several shorthands', () => {
    assert.equal(countFor('{ canAdminOrg, canBill }'), 2)
  })

  test('records the array form', () => {
    assert.equal(countFor('[canAdminOrg, canBill]'), 2)
  })

  test('records a group whose value is an array', () => {
    assert.equal(countFor('{ org: [canAdminOrg, canBill] }'), 2)
  })

  test('records a call expression, shorthand-adjacent', () => {
    assert.equal(countFor('{ quota: hasEmailQuota(100) }'), 1)
  })

  test('records nothing for an empty object', () => {
    assert.equal(countFor('{}'), 0)
  })
})
