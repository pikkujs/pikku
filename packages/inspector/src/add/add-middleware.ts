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

  // Handle addHTTPMiddleware(...) - global or route-specific
  if (expression.text === 'addHTTPMiddleware') {
    // Two signatures:
    // 1. addHTTPMiddleware([middleware1, middleware2]) - global
    // 2. addHTTPMiddleware('/path/*', [middleware1, middleware2]) - route-specific

    const firstArg = args[0]
    if (!firstArg) return

    // Check if first arg is a string (route pattern) or array (global middleware)
    if (ts.isStringLiteral(firstArg)) {
      // Route-specific: addHTTPMiddleware('/path', [middleware])
      const pattern = firstArg.text
      const middlewareArrayArg = args[1]

      if (!middlewareArrayArg) return

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
    } else {
      // Global: addHTTPMiddleware([middleware])
      const middlewareNames = extractMiddlewarePikkuNames(firstArg, checker)
      if (middlewareNames.length > 0) {
        state.http.globalMiddleware.push(...middlewareNames)
        logger.debug(
          `• Found HTTP global middleware: [${middlewareNames.join(', ')}]`
        )
      }
    }
    return
  }
}
