import * as ts from 'typescript'
import { AddWiring } from './types.js'
import { extractFunctionName } from './utils/extract-function-name.js'
import { extractServicesFromFunction } from './utils/extract-services.js'

/**
 * Inspect pikkuPermission calls and extract first-arg destructuring
 * for tree shaking optimization.
 */
export const addPermission: AddWiring = (logger, node, checker, state) => {
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
