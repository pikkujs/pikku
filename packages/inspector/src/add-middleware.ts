import * as ts from 'typescript'
import { InspectorLogger, InspectorState } from './types.js'
import { extractFunctionName, extractServicesFromFunction } from './utils.js'

/**
 * Inspect pikkuMiddleware calls and extract first-arg destructuring
 * for tree shaking optimization.
 */
export function addMiddleware(
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  logger: InspectorLogger
) {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node

  // only handle calls like pikkuMiddleware(...)
  if (!ts.isIdentifier(expression)) {
    return
  }

  if (expression.text !== 'pikkuMiddleware') {
    return
  }

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
}
