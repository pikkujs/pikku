import * as ts from 'typescript'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { AddWiring } from '../types.js'
import {
  extractFunctionName,
  makeContextBasedId,
} from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { extractWireNames } from '../utils/post-process.js'
import { ErrorCode } from '../error-codes.js'

export const addQueueWorker: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]
  const expression = node.expression

  // Check if the call is to addQueueWorker
  if (!ts.isIdentifier(expression) || expression.text !== 'wireQueueWorker') {
    return
  }

  if (!firstArg) {
    return
  }

  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    const name = getPropertyValue(obj, 'name') as string | null
    const { disabled, tags, summary, description, errors } =
      getCommonWireMetaData(obj, 'Queue worker', name, logger)

    if (disabled) return

    // --- find the referenced function ---
    const funcInitializer = getPropertyAssignmentInitializer(
      obj,
      'func',
      true,
      checker
    )
    if (!funcInitializer) {
      logger.critical(
        ErrorCode.MISSING_FUNC,
        `No valid 'func' property for queue processor '${name}'.`
      )
      return
    }

    const extracted = extractFunctionName(
      funcInitializer,
      checker,
      state.rootDir
    )
    let pikkuFuncId = extracted.pikkuFuncId
    if (pikkuFuncId.startsWith('__temp_') && name) {
      pikkuFuncId = makeContextBasedId('queue', name)
    }

    if (!name) {
      logger.critical(
        ErrorCode.MISSING_QUEUE_NAME,
        `No 'name' provided for queue processor function '${pikkuFuncId}'.`
      )
      return
    }

    // --- resolve middleware ---
    const middleware = resolveMiddleware(state, obj, tags, checker)

    // --- track used functions/middleware for service aggregation ---
    state.serviceAggregation.usedFunctions.add(pikkuFuncId)
    extractWireNames(middleware).forEach((n) =>
      state.serviceAggregation.usedMiddleware.add(n)
    )

    state.queueWorkers.files.add(node.getSourceFile().fileName)
    state.queueWorkers.meta[name] = {
      pikkuFuncId,
      name,
      summary,
      description,
      errors,
      tags,
      middleware,
    }
  }
}
