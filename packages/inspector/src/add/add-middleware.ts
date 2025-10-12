import * as ts from 'typescript'
import { AddWiring } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { extractServicesFromFunction } from '../utils/extract-services.js'
import { extractMiddlewarePikkuNames } from '../utils/middleware.js'

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
    const handlerNode = args[0]
    if (!handlerNode) return

    if (
      !ts.isArrowFunction(handlerNode) &&
      !ts.isFunctionExpression(handlerNode)
    ) {
      logger.error(`• Handler for pikkuMiddleware is not a function.`)
      return
    }

    const services = extractServicesFromFunction(handlerNode)
    const { pikkuFuncName, exportedName } = extractFunctionName(node, checker)
    state.middleware.meta[pikkuFuncName] = {
      services,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      exportedName,
    }

    logger.debug(
      `• Found middleware with services: ${services.services.join(', ')}`
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
    }

    const { pikkuFuncName, exportedName } = extractFunctionName(node, checker)
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

    // Extract middleware pikkuFuncNames from array
    const middlewareNames = extractMiddlewarePikkuNames(
      middlewareArrayArg,
      checker
    )

    if (middlewareNames.length > 0) {
      state.middleware.tagMiddleware.set(tag, middlewareNames)
      logger.debug(
        `• Found tag middleware: ${tag} -> [${middlewareNames.join(', ')}]`
      )
    }
    return
  }

  // Handle addHTTPMiddleware(...) - route-based middleware
  if (expression.text === 'addHTTPMiddleware') {
    // Two signatures:
    // 1. addHTTPMiddleware([middleware1, middleware2]) - defaults to route '*'
    // 2. addHTTPMiddleware('/path/*', [middleware1, middleware2]) - specific route

    const firstArg = args[0]
    if (!firstArg) return

    let pattern = '*' // default to all routes
    let middlewareArrayArg = firstArg

    // Check if first arg is a string (route pattern)
    if (ts.isStringLiteral(firstArg)) {
      pattern = firstArg.text
      middlewareArrayArg = args[1]
      if (!middlewareArrayArg) return
    }

    const middlewareNames = extractMiddlewarePikkuNames(
      middlewareArrayArg,
      checker
    )
    if (middlewareNames.length > 0) {
      state.http.routeMiddleware.set(pattern, middlewareNames)
      logger.debug(
        `• Found HTTP route middleware: ${pattern} -> [${middlewareNames.join(', ')}]`
      )
    }
    return
  }
}
