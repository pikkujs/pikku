import * as ts from 'typescript'
import { AddWiring } from '../types.js'
import {
  extractFunctionName,
  isNamedExport,
} from '../utils/extract-function-name.js'
import { extractServicesFromFunction } from '../utils/extract-services.js'
import { extractMiddlewarePikkuNames } from '../utils/middleware.js'
import { getPropertyValue } from '../utils/get-property-value.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'

/**
 * Inspect pikkuMiddleware calls, addMiddleware calls, and addHTTPMiddleware calls
 */
export const addMiddleware: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node

  // only handle specific function calls
  if (!ts.isIdentifier(expression)) {
    return
  }

  // Handle pikkuMiddleware(...) - individual middleware function definition
  if (expression.text === 'pikkuMiddleware') {
    const arg = args[0]
    if (!arg) return

    let actualHandler: ts.ArrowFunction | ts.FunctionExpression
    let name: string | undefined
    let description: string | undefined

    // Check if using object syntax: pikkuMiddleware({ func: ..., name: '...', description: '...' })
    if (ts.isObjectLiteralExpression(arg)) {
      // Extract name and description metadata
      const nameValue = getPropertyValue(arg, 'name')
      const descValue = getPropertyValue(arg, 'description')
      name = typeof nameValue === 'string' ? nameValue : undefined
      description = typeof descValue === 'string' ? descValue : undefined

      // Extract the func property
      const fnProp = getPropertyAssignmentInitializer(
        arg,
        'func',
        true,
        checker
      )
      if (
        !fnProp ||
        (!ts.isArrowFunction(fnProp) && !ts.isFunctionExpression(fnProp))
      ) {
        logger.error(
          `• pikkuMiddleware object missing required 'func' property.`
        )
        return
      }
      actualHandler = fnProp
    } else if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      actualHandler = arg
    } else {
      logger.error(`• Handler for pikkuMiddleware is not a function.`)
      return
    }

    const services = extractServicesFromFunction(actualHandler)
    const { pikkuFuncName, exportedName } = extractFunctionName(
      node,
      checker,
      state.rootDir
    )
    state.middleware.meta[pikkuFuncName] = {
      services,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      exportedName,
      name,
      description,
    }

    logger.debug(
      `• Found middleware with services: ${services.services.join(', ')}${name ? ` (name: ${name})` : ''}${description ? ` (description: ${description})` : ''}`
    )
    return
  }

  // Handle pikkuMiddlewareFactory(...) - middleware factory function
  if (expression.text === 'pikkuMiddlewareFactory') {
    const factoryNode = args[0]
    if (!factoryNode) return

    if (
      !ts.isArrowFunction(factoryNode) &&
      !ts.isFunctionExpression(factoryNode)
    ) {
      logger.error(`• Handler for pikkuMiddlewareFactory is not a function.`)
      return
    }

    // Extract services by looking inside the factory function body
    // The factory should return pikkuMiddleware(...), so we need to find that call
    // If no wrapper is found, extract from the factory's returned function directly
    let services = { optimized: false, services: [] as string[] }

    const findPikkuMiddlewareCall = (
      node: ts.Node
    ): ts.CallExpression | undefined => {
      if (ts.isCallExpression(node)) {
        const expr = node.expression
        if (ts.isIdentifier(expr) && expr.text === 'pikkuMiddleware') {
          return node
        }
      }
      return ts.forEachChild(node, findPikkuMiddlewareCall)
    }

    const pikkuMiddlewareCall = findPikkuMiddlewareCall(factoryNode)
    if (pikkuMiddlewareCall && pikkuMiddlewareCall.arguments[0]) {
      const middlewareHandler = pikkuMiddlewareCall.arguments[0]
      if (
        ts.isArrowFunction(middlewareHandler) ||
        ts.isFunctionExpression(middlewareHandler)
      ) {
        services = extractServicesFromFunction(middlewareHandler)
      }
    } else {
      // No pikkuMiddleware wrapper found - extract from factory's return value directly
      // Factory pattern: (config) => (services, wire, next) => { ... }
      if (
        ts.isArrowFunction(factoryNode) ||
        ts.isFunctionExpression(factoryNode)
      ) {
        const factoryBody = factoryNode.body
        // Check if the body is an arrow function (direct return)
        if (
          ts.isArrowFunction(factoryBody) ||
          ts.isFunctionExpression(factoryBody)
        ) {
          services = extractServicesFromFunction(factoryBody)
        }
      }
    }

    const { pikkuFuncName, exportedName } = extractFunctionName(
      node,
      checker,
      state.rootDir
    )
    state.middleware.meta[pikkuFuncName] = {
      services,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      exportedName,
      factory: true,
    }

    logger.debug(
      `• Found middleware factory with services: ${services.services.join(', ')}`
    )
    return
  }

  // Handle addMiddleware('tag', [middleware1, middleware2])
  // Supports two patterns:
  // 1. export const x = () => addMiddleware('tag', [...])  (factory - tree-shakeable)
  // 2. export const x = addMiddleware('tag', [...])  (direct - no tree-shaking)
  if (expression.text === 'addMiddleware') {
    const tagArg = args[0]
    const middlewareArrayArg = args[1]

    if (!tagArg || !middlewareArrayArg) return

    // Extract tag name
    let tag: string | undefined
    if (ts.isStringLiteral(tagArg)) {
      tag = tagArg.text
    }

    if (!tag) {
      logger.warn(`• addMiddleware call without valid tag string`)
      return
    }

    // Check if middleware array is a literal array
    if (!ts.isArrayLiteralExpression(middlewareArrayArg)) {
      logger.error(
        `• addMiddleware('${tag}', ...) must have a literal array as second argument`
      )
      return
    }

    // Extract middleware pikkuFuncNames from array
    const middlewareNames = extractMiddlewarePikkuNames(
      middlewareArrayArg,
      checker,
      state.rootDir
    )

    if (middlewareNames.length === 0) {
      logger.warn(`• addMiddleware('${tag}', ...) has empty middleware array`)
      return
    }

    // Collect services from all middleware in the group
    const allServices = new Set<string>()
    for (const middlewareName of middlewareNames) {
      const middlewareMeta = state.middleware.meta[middlewareName]
      if (middlewareMeta && middlewareMeta.services) {
        for (const service of middlewareMeta.services.services) {
          allServices.add(service)
        }
      }
    }

    // Check if this call is wrapped in a factory function
    // We need to walk up the tree to see if the parent is: const x = () => addMiddleware(...)
    let isFactory = false
    let exportedName: string | null = null
    let parent = node.parent

    // Check if parent is arrow function: () => addMiddleware(...)
    if (parent && ts.isArrowFunction(parent)) {
      // Check if arrow function has no parameters
      if (parent.parameters.length === 0) {
        isFactory = true

        // For factories, we need to check the arrow function's parent for the export name
        // const apiTagMiddleware = () => addMiddleware(...)
        const arrowParent = parent.parent
        if (arrowParent && ts.isVariableDeclaration(arrowParent)) {
          if (ts.isIdentifier(arrowParent.name)) {
            // Check if it's exported
            if (isNamedExport(arrowParent)) {
              exportedName = arrowParent.name.text
            }
          }
        }
      }
    }

    // If not a factory, get export name from the call expression itself
    if (!isFactory) {
      const extracted = extractFunctionName(node, checker, state.rootDir)
      exportedName = extracted.exportedName
    }

    // Log warning if not using factory pattern
    if (!isFactory && exportedName) {
      logger.warn(
        `• Middleware group '${exportedName}' for tag '${tag}' is not wrapped in a factory function. ` +
          `For tree-shaking, use: export const ${exportedName} = () => addMiddleware('${tag}', [...])`
      )
    }

    // Store group metadata
    state.middleware.tagMiddleware.set(tag, {
      exportName: exportedName,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      services: {
        optimized: false,
        services: Array.from(allServices),
      },
      middlewareCount: middlewareNames.length,
      isFactory,
    })

    logger.debug(
      `• Found tag middleware group: ${tag} -> [${middlewareNames.join(', ')}] (${isFactory ? 'factory' : 'direct'})`
    )
    return
  }

  // Handle addHTTPMiddleware(pattern, [middleware1, middleware2])
  // Supports two patterns:
  // 1. export const x = () => addHTTPMiddleware('*', [...])  (factory - tree-shakeable)
  // 2. export const x = addHTTPMiddleware('*', [...])  (direct - no tree-shaking)
  if (expression.text === 'addHTTPMiddleware') {
    const patternArg = args[0]
    const middlewareArrayArg = args[1]

    if (!patternArg || !middlewareArrayArg) return

    // Extract route pattern
    let pattern: string | undefined
    if (ts.isStringLiteral(patternArg)) {
      pattern = patternArg.text
    }

    if (!pattern) {
      logger.warn(`• addHTTPMiddleware call without valid pattern string`)
      return
    }

    // Check if middleware array is a literal array
    if (!ts.isArrayLiteralExpression(middlewareArrayArg)) {
      logger.error(
        `• addHTTPMiddleware('${pattern}', ...) must have a literal array as second argument`
      )
      return
    }

    // Extract middleware pikkuFuncNames from array
    const middlewareNames = extractMiddlewarePikkuNames(
      middlewareArrayArg,
      checker,
      state.rootDir
    )

    if (middlewareNames.length === 0) {
      logger.warn(
        `• addHTTPMiddleware('${pattern}', ...) has empty middleware array`
      )
      return
    }

    // Collect services from all middleware in the group
    const allServices = new Set<string>()
    for (const middlewareName of middlewareNames) {
      const middlewareMeta = state.middleware.meta[middlewareName]
      if (middlewareMeta && middlewareMeta.services) {
        for (const service of middlewareMeta.services.services) {
          allServices.add(service)
        }
      }
    }

    // Check if this call is wrapped in a factory function
    let isFactory = false
    let exportedName: string | null = null
    let parent = node.parent

    // Check if parent is arrow function: () => addHTTPMiddleware(...)
    if (parent && ts.isArrowFunction(parent)) {
      // Check if arrow function has no parameters
      if (parent.parameters.length === 0) {
        isFactory = true

        // For factories, we need to check the arrow function's parent for the export name
        // const apiRouteMiddleware = () => addHTTPMiddleware(...)
        const arrowParent = parent.parent
        if (arrowParent && ts.isVariableDeclaration(arrowParent)) {
          if (ts.isIdentifier(arrowParent.name)) {
            // Check if it's exported
            if (isNamedExport(arrowParent)) {
              exportedName = arrowParent.name.text
            }
          }
        }
      }
    }

    // If not a factory, get export name from the call expression itself
    if (!isFactory) {
      const extracted = extractFunctionName(node, checker, state.rootDir)
      exportedName = extracted.exportedName
    }

    // Log warning if not using factory pattern
    if (!isFactory && exportedName) {
      logger.warn(
        `• HTTP middleware group '${exportedName}' for pattern '${pattern}' is not wrapped in a factory function. ` +
          `For tree-shaking, use: export const ${exportedName} = () => addHTTPMiddleware('${pattern}', [...])`
      )
    }

    // Store group metadata
    state.http.routeMiddleware.set(pattern, {
      exportName: exportedName,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      services: {
        optimized: false,
        services: Array.from(allServices),
      },
      middlewareCount: middlewareNames.length,
      isFactory,
    })

    logger.debug(
      `• Found HTTP route middleware group: ${pattern} -> [${middlewareNames.join(', ')}] (${isFactory ? 'factory' : 'direct'})`
    )
    return
  }
}
