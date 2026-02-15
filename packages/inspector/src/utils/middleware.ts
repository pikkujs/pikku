import * as ts from 'typescript'
import { MiddlewareMetadata } from '@pikku/core'
import { extractFunctionName } from './extract-function-name.js'
import { InspectorState } from '../types.js'

export interface MiddlewareRef {
  definitionId: string
  isFactoryCall: boolean
}

export function extractMiddlewareRefs(
  arrayNode: ts.Expression,
  checker: ts.TypeChecker,
  rootDir: string
): MiddlewareRef[] {
  if (!ts.isArrayLiteralExpression(arrayNode)) {
    return []
  }

  const refs: MiddlewareRef[] = []
  for (const element of arrayNode.elements) {
    if (ts.isIdentifier(element)) {
      const { pikkuFuncId } = extractFunctionName(element, checker, rootDir)
      refs.push({
        definitionId: pikkuFuncId.startsWith('__temp_')
          ? element.text
          : pikkuFuncId,
        isFactoryCall: false,
      })
    } else if (ts.isCallExpression(element)) {
      const { pikkuFuncId } = extractFunctionName(
        element.expression,
        checker,
        rootDir
      )
      refs.push({
        definitionId:
          pikkuFuncId.startsWith('__temp_') &&
          ts.isIdentifier(element.expression)
            ? element.expression.text
            : pikkuFuncId,
        isFactoryCall: true,
      })
    }
  }
  return refs
}

export function extractMiddlewarePikkuNames(
  arrayNode: ts.Expression,
  checker: ts.TypeChecker,
  rootDir: string
): string[] {
  return extractMiddlewareRefs(arrayNode, checker, rootDir).map(
    (r) => r.definitionId
  )
}

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

export function routeMatchesPattern(route: string, pattern: string): boolean {
  if (route === pattern) return true

  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(route)
}

export function resolveHTTPMiddleware(
  state: InspectorState,
  route: string,
  tags: string[] | undefined,
  explicitMiddlewareNode: ts.Expression | undefined,
  checker: ts.TypeChecker
): MiddlewareMetadata[] | undefined {
  const resolved: MiddlewareMetadata[] = []

  for (const [pattern, _groupMeta] of state.http.routeMiddleware.entries()) {
    if (routeMatchesPattern(route, pattern)) {
      resolved.push({
        type: 'http',
        route: pattern,
      })
    }
  }

  if (tags && tags.length > 0) {
    for (const tag of tags) {
      if (state.middleware.tagMiddleware.has(tag)) {
        resolved.push({
          type: 'tag',
          tag,
        })
      }
    }
  }

  if (explicitMiddlewareNode) {
    const middlewareNames = extractMiddlewarePikkuNames(
      explicitMiddlewareNode,
      checker,
      state.rootDir
    )
    for (const name of middlewareNames) {
      const def = state.middleware.definitions[name]
      resolved.push({
        type: 'wire',
        name,
        inline: def?.exportedName === null,
      })
    }
  }

  return resolved.length > 0 ? resolved : undefined
}

function resolveTagAndExplicitMiddleware(
  state: InspectorState,
  tags: string[] | undefined,
  explicitMiddlewareNode: ts.Expression | undefined,
  checker: ts.TypeChecker
): MiddlewareMetadata[] {
  const resolved: MiddlewareMetadata[] = []

  if (tags && tags.length > 0) {
    for (const tag of tags) {
      if (state.middleware.tagMiddleware.has(tag)) {
        resolved.push({
          type: 'tag',
          tag,
        })
      }
    }
  }

  if (explicitMiddlewareNode) {
    const middlewareNames = extractMiddlewarePikkuNames(
      explicitMiddlewareNode,
      checker,
      state.rootDir
    )
    for (const name of middlewareNames) {
      const def = state.middleware.definitions[name]
      resolved.push({
        type: 'wire',
        name,
        inline: def?.exportedName === null,
      })
    }
  }

  return resolved
}

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

function getAIMiddlewareNode(
  obj: ts.ObjectLiteralExpression
): ts.Expression | undefined {
  const prop = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === 'aiMiddleware'
  ) as ts.PropertyAssignment | undefined
  return prop?.initializer
}

export function resolveAIMiddleware(
  state: InspectorState,
  obj: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker
): MiddlewareMetadata[] | undefined {
  const explicitNode = getAIMiddlewareNode(obj)
  if (!explicitNode) return undefined

  const names = extractMiddlewarePikkuNames(
    explicitNode,
    checker,
    state.rootDir
  )
  const resolved: MiddlewareMetadata[] = names.map((name) => {
    const def = state.aiMiddleware.definitions[name]
    return {
      type: 'wire' as const,
      name,
      inline: def?.exportedName === null,
    }
  })

  return resolved.length > 0 ? resolved : undefined
}

function getChannelMiddlewareNode(
  obj: ts.ObjectLiteralExpression
): ts.Expression | undefined {
  const prop = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === 'channelMiddleware'
  ) as ts.PropertyAssignment | undefined
  return prop?.initializer
}

export function resolveChannelMiddleware(
  state: InspectorState,
  obj: ts.ObjectLiteralExpression,
  tags: string[] | undefined,
  checker: ts.TypeChecker
): MiddlewareMetadata[] | undefined {
  const resolved: MiddlewareMetadata[] = []

  if (tags && tags.length > 0) {
    for (const tag of tags) {
      if (state.channelMiddleware.tagMiddleware.has(tag)) {
        resolved.push({
          type: 'tag',
          tag,
        })
      }
    }
  }

  const explicitNode = getChannelMiddlewareNode(obj)
  if (explicitNode) {
    const names = extractMiddlewarePikkuNames(
      explicitNode,
      checker,
      state.rootDir
    )
    for (const name of names) {
      const def = state.channelMiddleware.definitions[name]
      resolved.push({
        type: 'wire',
        name,
        inline: def?.exportedName === null,
      })
    }
  }

  return resolved.length > 0 ? resolved : undefined
}
