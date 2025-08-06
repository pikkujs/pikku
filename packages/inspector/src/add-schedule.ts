import * as ts from 'typescript'
import { getPropertyValue } from './get-property-value.js'
import { APIDocs, PikkuWiringTypes } from '@pikku/core'
import { InspectorFilters, InspectorState, InspectorLogger } from './types.js'
import {
  extractFunctionName,
  getPropertyAssignmentInitializer,
  matchesFilters,
} from './utils.js'

export const addSchedule = (
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  filters: InspectorFilters,
  logger: InspectorLogger
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
    const docs = (getPropertyValue(obj, 'docs') as APIDocs) || undefined
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
      checker
    ).pikkuFuncName

    if (!nameValue || !scheduleValue) {
      return
    }

    const filePath = node.getSourceFile().fileName

    if (
      !matchesFilters(
        filters,
        { tags },
        { type: PikkuWiringTypes.scheduler, name: nameValue, filePath },
        logger
      )
    ) {
      return
    }

    state.scheduledTasks.files.add(node.getSourceFile().fileName)
    state.scheduledTasks.meta[nameValue] = {
      pikkuFuncName,
      name: nameValue,
      schedule: scheduleValue,
      docs,
      tags,
    }
  }
}
