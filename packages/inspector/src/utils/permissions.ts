import * as ts from 'typescript'
import type { PermissionMetadata } from '@pikku/core'
import { extractFunctionName } from './extract-function-name.js'
import type { InspectorState } from '../types.js'

/**
 * Extract permission pikkuFuncIds from an expression (array or object literal)
 * Resolves each identifier to its pikkuFuncId using extractFunctionName
 * Also handles call expressions (like rolePermission({...}))
 *
 * Supports both formats:
 * - Array: [permission1, permission2]
 * - Record: { groupName: permission1, anotherGroup: [permission2, permission3] }
 */
export function extractPermissionPikkuNames(
  node: ts.Expression,
  checker: ts.TypeChecker,
  rootDir: string
): string[] {
  const names: string[] = []

  // Helper to extract from a single element
  const extractFromElement = (element: ts.Expression) => {
    if (ts.isIdentifier(element)) {
      const { pikkuFuncId } = extractFunctionName(element, checker, rootDir)
      names.push(pikkuFuncId)
    } else if (ts.isCallExpression(element)) {
      // Handle call expressions like hasEmailQuota(100) or rolePermission({...})
      // Extract the function being called (e.g., 'hasEmailQuota' from 'hasEmailQuota(100)')
      const { pikkuFuncId } = extractFunctionName(
        element.expression,
        checker,
        rootDir
      )
      names.push(pikkuFuncId)
    } else if (ts.isArrayLiteralExpression(element)) {
      // Nested array (for Record values that are arrays)
      for (const nestedElement of element.elements) {
        extractFromElement(nestedElement)
      }
    }
  }

  if (ts.isArrayLiteralExpression(node)) {
    // Array format: [permission1, permission2]
    for (const element of node.elements) {
      extractFromElement(element)
    }
  } else if (ts.isObjectLiteralExpression(node)) {
    // Record format: { groupName: permission1, anotherGroup: [permission2] }
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        extractFromElement(prop.initializer)
      }
    }
  }

  return names
}

/**
 * Get permissions array from an object literal expression property
 * Returns the initializer node for the 'permissions' property if it exists
 */
export function getPermissionsNode(
  obj: ts.ObjectLiteralExpression
): ts.Expression | undefined {
  const permissionsProp = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === 'permissions'
  ) as ts.PropertyAssignment | undefined

  return permissionsProp?.initializer
}

/**
 * Resolve the explicit permission references declared on a function (or agent).
 * Permissions are function-scoped only: a `permissions: { group: [fn] }` object
 * is flattened to `{ type: 'wire', name }` references used at filter time.
 * Returns undefined if none are declared, otherwise an array with ≥1 item.
 */
function resolveExplicitPermissions(
  state: InspectorState,
  explicitPermissionsNode: ts.Expression | undefined,
  checker: ts.TypeChecker
): PermissionMetadata[] | undefined {
  if (!explicitPermissionsNode) {
    return undefined
  }

  const resolved: PermissionMetadata[] = []
  const permissionNames = extractPermissionPikkuNames(
    explicitPermissionsNode,
    checker,
    state.rootDir
  )
  for (const name of permissionNames) {
    const def = state.permissions.definitions[name]
    resolved.push({
      type: 'wire',
      name,
      inline: def?.exportedName === null,
    })
  }

  return resolved.length > 0 ? resolved : undefined
}

/**
 * Convenience wrapper: Extract permissions node from object and resolve
 * Use this in add-* files for cleaner code
 */
export function resolvePermissions(
  state: InspectorState,
  obj: ts.ObjectLiteralExpression,
  _tags: string[] | undefined,
  checker: ts.TypeChecker
): PermissionMetadata[] | undefined {
  return resolveExplicitPermissions(state, getPermissionsNode(obj), checker)
}
