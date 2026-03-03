import * as ts from 'typescript'
import type { AddWiring } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import {
  extractServicesFromFunction,
  extractUsedWires,
} from '../utils/extract-services.js'

/**
 * Inspect pikkuApprovalDescription() calls and extract metadata
 */
export const addApprovalDescription: AddWiring = (
  logger,
  node,
  checker,
  state
) => {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node

  if (!ts.isIdentifier(expression)) return
  if (expression.text !== 'pikkuApprovalDescription') return

  const arg = args[0]
  if (!arg) return

  let actualHandler: ts.ArrowFunction | ts.FunctionExpression

  if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
    actualHandler = arg
  } else {
    logger.error(`• Handler for pikkuApprovalDescription is not a function.`)
    return
  }

  const services = extractServicesFromFunction(actualHandler)
  const wires = extractUsedWires(actualHandler, 1)
  let { pikkuFuncId, exportedName } = extractFunctionName(
    node,
    checker,
    state.rootDir
  )

  if (pikkuFuncId.startsWith('__temp_')) {
    if (
      ts.isVariableDeclaration(node.parent) &&
      ts.isIdentifier(node.parent.name)
    ) {
      pikkuFuncId = node.parent.name.text
    } else if (
      ts.isPropertyAssignment(node.parent) &&
      ts.isIdentifier(node.parent.name)
    ) {
      pikkuFuncId = node.parent.name.text
    } else {
      logger.error(
        `• pikkuApprovalDescription() must be assigned to a variable or object property. ` +
          `Extract it to a const: const myApproval = pikkuApprovalDescription(...)`
      )
      return
    }
  }

  state.functions.approvalDescriptions[pikkuFuncId] = {
    services,
    wires: wires.wires.length > 0 || !wires.optimized ? wires : undefined,
    sourceFile: node.getSourceFile().fileName,
    position: node.getStart(),
    exportedName,
  }

  logger.debug(
    `• Found approval description '${pikkuFuncId}' with services: ${services.services.join(', ')}`
  )
}
