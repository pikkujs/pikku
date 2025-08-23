import * as ts from 'typescript'
import { InspectorLogger, InspectorState } from './types.js'
import { extractFunctionName, extractServicesFromFunction } from './utils.js'

/**
 * Inspect pikkuPermission calls and extract first-arg destructuring
 * for tree shaking optimization.
 */
export function addPermission(
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  logger: InspectorLogger
) {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node

  // only handle calls like pikkuPermission(...)
  if (!ts.isIdentifier(expression)) {
    return
  }

  if (expression.text !== 'pikkuPermission') {
    return
  }

  const handlerNode = args[0]
  if (!handlerNode) return

  if (
    !ts.isArrowFunction(handlerNode) &&
    !ts.isFunctionExpression(handlerNode)
  ) {
    logger.error(`• Handler for pikkuPermission is not a function.`)
    return
  }

  const services = extractServicesFromFunction(handlerNode)

  const { pikkuFuncName, exportedName } = extractFunctionName(node, checker)

  state.permissions.meta[pikkuFuncName] = {
    services,
    sourceFile: node.getSourceFile().fileName,
    position: node.getStart(),
    exportedName,
  }

  logger.debug(
    `• Found permission with services: ${services.services.join(', ')}`
  )
}
