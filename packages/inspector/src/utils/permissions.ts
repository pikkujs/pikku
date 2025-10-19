import * as ts from 'typescript'
import { PermissionMetadata } from '@pikku/core'
import { extractFunctionName } from './extract-function-name.js'
import { InspectorState } from '../types.js'

/**
 * Extract permission pikkuFuncNames from an expression (array or object literal)
 * Resolves each identifier to its pikkuFuncName using extractFunctionName
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
      const { pikkuFuncName } = extractFunctionName(element, checker, rootDir)
      names.push(pikkuFuncName)
    } else if (ts.isCallExpression(element)) {
      // Handle call expressions like hasEmailQuota(100) or rolePermission({...})
      // Extract the function being called (e.g., 'hasEmailQuota' from 'hasEmailQuota(100)')
      const { pikkuFuncName } = extractFunctionName(element.expression, checker, rootDir)
      names.push(pikkuFuncName)
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
 * Check if a route matches a pattern with wildcards
 * Pattern can be exact match or use * as wildcard
 * e.g., '/api/*' matches '/api/users', '/api/posts/123', etc.
 */
export function routeMatchesPattern(route: string, pattern: string): boolean {
  if (route === pattern) return true

  // Convert pattern to regex: replace * with .*
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except *
    .replace(/\*/g, '.*') // Replace * with .*

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(route)
}

/**
 * Resolve permissions for an HTTP wiring based on:
 * 1. Global HTTP permissions (addHTTPPermission('*', [...]))
 * 2. Route-specific HTTP permissions (addHTTPPermission('/pattern', [...]))
 * 3. Tag-based permissions (addPermission('tag', [...]))
 * 4. Explicit wiring permissions (wireHTTP({ permissions: [...] }))
 * Returns undefined if no permissions are found, otherwise returns array with at least one item
 */
export function resolveHTTPPermissions(
  state: InspectorState,
  route: string,
  tags: string[] | undefined,
  explicitPermissionsNode: ts.Expression | undefined,
  checker: ts.TypeChecker
): PermissionMetadata[] | undefined {
  const resolved: PermissionMetadata[] = []

  // 1. HTTP route permission groups (includes '*' for global)
  for (const [pattern, _groupMeta] of state.http.routePermissions.entries()) {
    if (routeMatchesPattern(route, pattern)) {
      // Just reference the group by route pattern
      resolved.push({
        type: 'http',
        route: pattern,
      })
    }
  }

  // 2. Tag-based permission groups
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      if (state.permissions.tagPermissions.has(tag)) {
        // Just reference the group by tag
        resolved.push({
          type: 'tag',
          tag,
        })
      }
    }
  }

  // 3. Explicit wire permissions (inline is OK here)
  if (explicitPermissionsNode) {
    const permissionNames = extractPermissionPikkuNames(
      explicitPermissionsNode,
      checker,
      state.rootDir
    )
    for (const name of permissionNames) {
      const meta = state.permissions.meta[name]
      resolved.push({
        type: 'wire',
        name,
        inline: meta?.exportedName === null,
      })
    }
  }

  return resolved.length > 0 ? resolved : undefined
}

/**
 * Resolve tag-based and explicit permissions (common logic for wires and functions)
 * 1. Tag-based permissions (addPermission('tag', [...]))
 * 2. Explicit permissions (wireHTTP/pikkuFunc({ permissions: [...] }))
 */
function resolveTagAndExplicitPermissions(
  state: InspectorState,
  tags: string[] | undefined,
  explicitPermissionsNode: ts.Expression | undefined,
  checker: ts.TypeChecker
): PermissionMetadata[] {
  const resolved: PermissionMetadata[] = []

  // 1. Tag-based permission groups
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      if (state.permissions.tagPermissions.has(tag)) {
        // Just reference the group by tag
        resolved.push({
          type: 'tag',
          tag,
        })
      }
    }
  }

  // 2. Explicit permissions (inline is OK here - used directly in wire/function)
  if (explicitPermissionsNode) {
    const permissionNames = extractPermissionPikkuNames(
      explicitPermissionsNode,
      checker,
      state.rootDir
    )
    for (const name of permissionNames) {
      const meta = state.permissions.meta[name]
      resolved.push({
        type: 'wire',
        name,
        inline: meta?.exportedName === null,
      })
    }
  }

  return resolved
}

/**
 * Resolve permissions for a function based on:
 * 1. Tag-based permissions (addPermission('tag', [...]))
 * 2. Explicit function permissions (pikkuFunc({ permissions: [...] }))
 * Returns undefined if no permissions are found, otherwise returns array with at least one item
 */
function resolveFunctionPermissionsInternal(
  state: InspectorState,
  tags: string[] | undefined,
  explicitPermissionsNode: ts.Expression | undefined,
  checker: ts.TypeChecker
): PermissionMetadata[] | undefined {
  const resolved = resolveTagAndExplicitPermissions(
    state,
    tags,
    explicitPermissionsNode,
    checker
  )

  return resolved.length > 0 ? resolved : undefined
}

/**
 * Convenience wrapper: Extract permissions node from object and resolve
 * Use this in add-* files for cleaner code
 */
export function resolvePermissions(
  state: InspectorState,
  obj: ts.ObjectLiteralExpression,
  tags: string[] | undefined,
  checker: ts.TypeChecker
): PermissionMetadata[] | undefined {
  const explicitPermissionsNode = getPermissionsNode(obj)
  return resolveFunctionPermissionsInternal(
    state,
    tags,
    explicitPermissionsNode,
    checker
  )
}

/**
 * Convenience wrapper for HTTP: Extract permissions and resolve with HTTP-specific logic
 * Use this in add-http-route.ts for cleaner code
 */
export function resolveHTTPPermissionsFromObject(
  state: InspectorState,
  route: string,
  obj: ts.ObjectLiteralExpression,
  tags: string[] | undefined,
  checker: ts.TypeChecker
): PermissionMetadata[] | undefined {
  const explicitPermissionsNode = getPermissionsNode(obj)
  return resolveHTTPPermissions(
    state,
    route,
    tags,
    explicitPermissionsNode,
    checker
  )
}
