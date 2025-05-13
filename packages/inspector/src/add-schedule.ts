import * as ts from 'typescript'
import { getPropertyValue } from './get-property-value.js'
import { APIDocs } from '@pikku/core'
import { InspectorFilters, InspectorState } from './types.js'
import { matchesFilters } from './utils.js'

export const addSchedule = (
  node: ts.Node,
  _checker: ts.TypeChecker,
  state: InspectorState,
  filters: InspectorFilters
) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]
  const expression = node.expression

  // Check if the call is to addScheduledTask
  if (!ts.isIdentifier(expression) || expression.text !== 'addScheduledTask') {
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

    if (!nameValue || !scheduleValue) {
      return
    }

    if (
      !matchesFilters(filters, { tags }, { type: 'schedule', name: nameValue })
    ) {
      return
    }

    state.scheduledTasks.files.add(node.getSourceFile().fileName)
    state.scheduledTasks.meta[nameValue] = {
      name: nameValue,
      schedule: scheduleValue,
      docs,
      tags,
    }
  }
}
