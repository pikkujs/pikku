import * as ts from 'typescript'
import { MiddlewareMetadata } from '@pikku/core'
import { extractFunctionName } from './extract-function-name.js'

/**
 * Extract middleware pikkuFuncNames from an array literal expression
 * Resolves each identifier to its pikkuFuncName using extractFunctionName
 */
export function extractMiddlewarePikkuNames(
  arrayNode: ts.Expression,
  checker: ts.TypeChecker
): string[] {
  if (!ts.isArrayLiteralExpression(arrayNode)) {
    return []
  }

  const names: string[] = []
  for (const element of arrayNode.elements) {
    if (ts.isIdentifier(element)) {
      // Resolve the identifier to its pikkuFuncName
      const { pikkuFuncName } = extractFunctionName(element, checker)
      names.push(pikkuFuncName)
    }
  }
  return names
}

/**
 * Get middleware array from an object literal expression property
 * Returns the initializer node for the 'middleware' property if it exists
 */
export function getMiddleware(
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
 * 1. Global HTTP middleware (addHTTPMiddleware([...]))
 * 2. Route-specific HTTP middleware (addHTTPMiddleware('/pattern', [...]))
 * 3. Tag-based middleware (addMiddleware('tag', [...]))
 * 4. Explicit wiring middleware (wireHTTP({ middleware: [...] }))
 * Returns undefined if no middleware is found, otherwise returns array with at least one item
 */
export function resolveHTTPMiddleware(
  state: any,
  route: string,
  tags: string[] | undefined,
  explicitMiddlewareNode: ts.Expression | undefined,
  checker: ts.TypeChecker
): MiddlewareMetadata[] | undefined {
  const resolved: MiddlewareMetadata[] = []

  // 1. Global HTTP middleware
  for (const name of state.http.globalMiddleware) {
    resolved.push({
      type: 'global',
      name,
      src: 'http',
    })
  }

  // 2. Route-specific HTTP middleware
  for (const [
    pattern,
    middlewareNames,
  ] of state.http.routeMiddleware.entries()) {
    if (routeMatchesPattern(route, pattern)) {
      for (const name of middlewareNames) {
        resolved.push({
          type: 'wire',
          name,
          src: 'http',
          pattern,
        })
      }
    }
  }

  // 3 & 4. Tag-based and explicit middleware (reuse common logic)
  const tagAndExplicit = resolveTagAndExplicitMiddleware(
    state,
    tags,
    explicitMiddlewareNode,
    checker,
    'wire' // HTTP wire-level middleware
  )
  resolved.push(...tagAndExplicit)

  return resolved.length > 0 ? resolved : undefined
}

/**
 * Resolve tag-based and explicit middleware (common logic for wires and functions)
 * 1. Tag-based middleware (addMiddleware('tag', [...]))
 * 2. Explicit middleware (wireHTTP/pikkuFunc({ middleware: [...] }))
 */
function resolveTagAndExplicitMiddleware(
  state: any,
  tags: string[] | undefined,
  explicitMiddlewareNode: ts.Expression | undefined,
  checker: ts.TypeChecker,
  type: 'wire' | undefined
): MiddlewareMetadata[] {
  const resolved: MiddlewareMetadata[] = []

  // 1. Tag-based middleware
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      const middlewareNames = state.middleware.tagMiddleware.get(tag)
      if (middlewareNames) {
        for (const name of middlewareNames) {
          resolved.push({
            type,
            name,
            src: 'tag',
            tag,
          })
        }
      }
    }
  }

  // 2. Explicit middleware
  if (explicitMiddlewareNode) {
    const middlewareNames = extractMiddlewarePikkuNames(
      explicitMiddlewareNode,
      checker
    )
    for (const name of middlewareNames) {
      resolved.push({
        type,
        name,
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
export function resolveFunctionMiddleware(
  state: any,
  tags: string[] | undefined,
  explicitMiddlewareNode: ts.Expression | undefined,
  checker: ts.TypeChecker
): MiddlewareMetadata[] | undefined {
  const resolved = resolveTagAndExplicitMiddleware(
    state,
    tags,
    explicitMiddlewareNode,
    checker,
    undefined // function-level has no type field
  )

  return resolved.length > 0 ? resolved : undefined
}
