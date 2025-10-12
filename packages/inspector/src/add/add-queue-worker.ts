import * as ts from 'typescript'
import { getPropertyValue } from '../utils/get-property-value.js'
import { PikkuDocs, PikkuWiringTypes } from '@pikku/core'
import { AddWiring } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { matchesFilters } from '../utils/filter-utils.js'
import { resolveMiddleware } from '../utils/middleware.js'

export const addQueueWorker: AddWiring = (
  logger,
  node,
  checker,
  state,
  options
) => {
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

    const queueName = getPropertyValue(obj, 'queueName') as string | null
    const docs = (getPropertyValue(obj, 'docs') as PikkuDocs) || undefined
    const tags = (getPropertyValue(obj, 'tags') as string[]) || undefined

    // --- find the referenced function ---
    const funcInitializer = getPropertyAssignmentInitializer(
      obj,
      'func',
      true,
      checker
    )
    if (!funcInitializer) {
      console.error(
        `• No valid 'func' property for queue processor '${queueName}'.`
      )
      return
    }

    const pikkuFuncName = extractFunctionName(
      funcInitializer,
      checker
    ).pikkuFuncName

    if (!queueName) {
      console.error(
        `• No 'queueName' provided for queue processor function '${pikkuFuncName}'.`
      )
      return
    }

    const filePath = node.getSourceFile().fileName

    if (
      !matchesFilters(
        options.filters || {},
        { tags },
        { type: PikkuWiringTypes.queue, name: queueName, filePath },
        logger
      )
    ) {
      console.info(
        `• Skipping queue processor '${pikkuFuncName}' for queue '${queueName}' due to filter mismatch.`
      )
      return
    }

    // --- resolve middleware ---
    const middleware = resolveMiddleware(logger, state, obj, tags, checker)

    state.queueWorkers.files.add(node.getSourceFile().fileName)
    state.queueWorkers.meta[queueName] = {
      pikkuFuncName,
      queueName,
      docs,
      tags,
      middleware,
    }
  }
}
