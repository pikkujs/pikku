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
export const addSchedule: AddWiring = (
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

  // Check if the call is to addScheduledTask
  if (!ts.isIdentifier(expression) || expression.text !== 'wireScheduler') {
    return
  }

  if (!firstArg) {
    return
  }

  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    const nameValue = getPropertyValue(obj, 'name') as string | null
    const scheduleValue = getPropertyValue(obj, 'schedule') as string | null
    const { disabled, tags, summary, description, errors } =
      getCommonWireMetaData(obj, 'Scheduler', nameValue, logger)

    if (disabled) return

    const funcInitializer = getPropertyAssignmentInitializer(
      obj,
      'func',
      true,
      checker
    )
    if (!funcInitializer) {
      logger.critical(
        ErrorCode.MISSING_FUNC,
        `No valid 'func' property for scheduled task '${nameValue}'.`
      )
      return
    }

    const extracted = extractFunctionName(
      funcInitializer,
      checker,
      state.rootDir
    )
    let pikkuFuncId = extracted.pikkuFuncId
    if (pikkuFuncId.startsWith('__temp_') && nameValue) {
      pikkuFuncId = makeContextBasedId('scheduler', nameValue)
    }

    if (!nameValue || !scheduleValue) {
      return
    }

    // --- resolve middleware ---
    const middleware = resolveMiddleware(state, obj, tags, checker)

    // --- track used functions/middleware for service aggregation ---
    state.serviceAggregation.usedFunctions.add(pikkuFuncId)
    extractWireNames(middleware).forEach((name) =>
      state.serviceAggregation.usedMiddleware.add(name)
    )

    state.scheduledTasks.files.add(node.getSourceFile().fileName)
    state.scheduledTasks.meta[nameValue] = {
      pikkuFuncId,
      name: nameValue,
      schedule: scheduleValue,
      summary,
      description,
      errors,
      tags,
      middleware,
    }
  }
}
