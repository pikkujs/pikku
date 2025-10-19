import * as ts from 'typescript'
import { getPropertyValue } from '../utils/get-property-value.js'
import { PikkuDocs, PikkuWiringTypes } from '@pikku/core'
import { AddWiring } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { matchesFilters } from '../utils/filter-utils.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { extractWireNames } from '../utils/post-process.js'

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
    const docs = (getPropertyValue(obj, 'docs') as PikkuDocs) || undefined
    const tags = (getPropertyValue(obj, 'tags') as string[]) || undefined

    const funcInitializer = getPropertyAssignmentInitializer(
      obj,
      'func',
      true,
      checker
    )
    if (!funcInitializer) {
      console.error(
        `• No valid 'func' property for scheduled task '${nameValue}'.`
      )
      return
    }

    const pikkuFuncName = extractFunctionName(
      funcInitializer,
      checker,
      state.rootDir
    ).pikkuFuncName

    if (!nameValue || !scheduleValue) {
      return
    }

    const filePath = node.getSourceFile().fileName

    if (
      !matchesFilters(
        options.filters || {},
        { tags, name: nameValue },
        { type: PikkuWiringTypes.scheduler, name: nameValue, filePath },
        logger
      )
    ) {
      return
    }

    // --- resolve middleware ---
    const middleware = resolveMiddleware(state, obj, tags, checker)

    // --- track used functions/middleware for service aggregation ---
    state.serviceAggregation.usedFunctions.add(pikkuFuncName)
    extractWireNames(middleware).forEach((name) =>
      state.serviceAggregation.usedMiddleware.add(name)
    )

    state.scheduledTasks.files.add(node.getSourceFile().fileName)
    state.scheduledTasks.meta[nameValue] = {
      pikkuFuncName,
      name: nameValue,
      schedule: scheduleValue,
      docs,
      tags,
      middleware,
    }
  }
}
