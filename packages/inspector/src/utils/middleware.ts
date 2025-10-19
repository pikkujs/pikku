import * as ts from 'typescript'
import { MiddlewareMetadata } from '@pikku/core'
import { extractFunctionName } from './extract-function-name.js'
import { InspectorState } from '../types.js'

/**
 * Extract middleware pikkuFuncNames from an array literal expression
 * Resolves each identifier to its pikkuFuncName using extractFunctionName
 * Also handles call expressions (like logCommandInfoAndTime({...}))
 */
export function extractMiddlewarePikkuNames(
  arrayNode: ts.Expression,
  checker: ts.TypeChecker,
  rootDir: string
): string[] {
  if (!ts.isArrayLiteralExpression(arrayNode)) {
    return []
  }

  const names: string[] = []
  for (const element of arrayNode.elements) {
    if (ts.isIdentifier(element)) {
      // Resolve the identifier to its pikkuFuncName
      const { pikkuFuncName } = extractFunctionName(element, checker, rootDir)
      names.push(pikkuFuncName)
    } else if (ts.isCallExpression(element)) {
      // Handle call expressions like rateLimiter(10) or logCommandInfoAndTime({...})
      // Extract the function being called (e.g., 'rateLimiter' from 'rateLimiter(10)')
      const { pikkuFuncName } = extractFunctionName(element.expression, checker, rootDir)
      names.push(pikkuFuncName)
    }
  }
  return names
}

/**
 * Get middleware array from an object literal expression property
 * Returns the initializer node for the 'middleware' property if it exists
 */
export function getMiddlewareNode(
  obj: ts.ObjectLiteralExpression
): ts.Expression | undefined {
  const middlewareProp = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === 'middleware'
  ) as ts.PropertyAssignment | undefined

  return middlewareProp?.initializer
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
 * Resolve middleware for an HTTP wiring based on:
 * 1. Global HTTP middleware (addd([...]))
 * 2. Route-specific HTTP middleware (addHTTPMiddleware('/pattern', [...]))
 * 3. Tag-based middleware (addMiddleware('tag', [...]))
 * 4. Explicit wiring middleware (wireHTTP({ middleware: [...] }))
 * Returns undefined if no middleware is found, otherwise returns array with at least one item
 */
export function resolveHTTPMiddleware(
  state: InspectorState,
  route: string,
  tags: string[] | undefined,
  explicitMiddlewareNode: ts.Expression | undefined,
  checker: ts.TypeChecker
): MiddlewareMetadata[] | undefined {
  const resolved: MiddlewareMetadata[] = []

  // 1. HTTP route middleware groups (includes '*' for global)
  for (const [pattern, _groupMeta] of state.http.routeMiddleware.entries()) {
    if (routeMatchesPattern(route, pattern)) {
      // Just reference the group by route pattern
      resolved.push({
        type: 'http',
        route: pattern,
      })
    }
  }

  // 2. Tag-based middleware groups
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      if (state.middleware.tagMiddleware.has(tag)) {
        // Just reference the group by tag
        resolved.push({
          type: 'tag',
          tag,
        })
      }
    }
  }

  // 3. Explicit wire middleware (inline is OK here)
  if (explicitMiddlewareNode) {
    const middlewareNames = extractMiddlewarePikkuNames(
      explicitMiddlewareNode,
      checker,
      state.rootDir
    )
    for (const name of middlewareNames) {
      const meta = state.middleware.meta[name]
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
 * Resolve tag-based and explicit middleware (common logic for wires and functions)
 * 1. Tag-based middleware (addMiddleware('tag', [...]))
 * 2. Explicit middleware (wireHTTP/pikkuFunc({ middleware: [...] }))
 */
function resolveTagAndExplicitMiddleware(
  state: InspectorState,
  tags: string[] | undefined,
  explicitMiddlewareNode: ts.Expression | undefined,
  checker: ts.TypeChecker
): MiddlewareMetadata[] {
  const resolved: MiddlewareMetadata[] = []

  // 1. Tag-based middleware groups
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      if (state.middleware.tagMiddleware.has(tag)) {
        // Just reference the group by tag
        resolved.push({
          type: 'tag',
          tag,
        })
      }
    }
  }

  // 2. Explicit middleware (inline is OK here - used directly in wire/function)
  if (explicitMiddlewareNode) {
    const middlewareNames = extractMiddlewarePikkuNames(
      explicitMiddlewareNode,
      checker,
      state.rootDir
    )
    for (const name of middlewareNames) {
      const meta = state.middleware.meta[name]
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
 * Resolve middleware for a function based on:
 * 1. Tag-based middleware (addMiddleware('tag', [...]))
 * 2. Explicit function middleware (pikkuFunc({ middleware: [...] }))
 * Returns undefined if no middleware is found, otherwise returns array with at least one item
 */
function resolveFunctionMiddlewareInternal(
  state: InspectorState,
  tags: string[] | undefined,
  explicitMiddlewareNode: ts.Expression | undefined,
  checker: ts.TypeChecker
): MiddlewareMetadata[] | undefined {
  const resolved = resolveTagAndExplicitMiddleware(
    state,
    tags,
    explicitMiddlewareNode,
    checker
  )

  return resolved.length > 0 ? resolved : undefined
}

/**
 * Convenience wrapper: Extract middleware node from object and resolve
 * Use this in add-* files for cleaner code
 */
export function resolveMiddleware(
  state: InspectorState,
  obj: ts.ObjectLiteralExpression,
  tags: string[] | undefined,
  checker: ts.TypeChecker
): MiddlewareMetadata[] | undefined {
  const explicitMiddlewareNode = getMiddlewareNode(obj)
  return resolveFunctionMiddlewareInternal(
    state,
    tags,
    explicitMiddlewareNode,
    checker
  )
}

/**
 * Convenience wrapper for HTTP: Extract middleware and resolve with HTTP-specific logic
 * Use this in add-http-route.ts for cleaner code
 */
export function resolveHTTPMiddlewareFromObject(
  state: InspectorState,
  route: string,
  obj: ts.ObjectLiteralExpression,
  tags: string[] | undefined,
  checker: ts.TypeChecker
): MiddlewareMetadata[] | undefined {
  const explicitMiddlewareNode = getMiddlewareNode(obj)
  return resolveHTTPMiddleware(
    state,
    route,
    tags,
    explicitMiddlewareNode,
    checker
  )
}
