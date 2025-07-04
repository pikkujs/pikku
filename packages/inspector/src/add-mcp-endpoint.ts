import * as ts from 'typescript'
import { getPropertyValue } from './get-property-value.js'
import { APIDocs, PikkuEventTypes } from '@pikku/core'
import { InspectorFilters, InspectorState } from './types.js'
import {
  extractFunctionName,
  getPropertyAssignmentInitializer,
  matchesFilters,
} from './utils.js'

export const addMCPEndpoint = (
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  filters: InspectorFilters
) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]
  const expression = node.expression

  // Check if the call is to addMCPEndpoint
  if (
    !ts.isIdentifier(expression) ||
    !['addMCPEndpoint'].includes(expression.text)
  ) {
    return
  }

  if (!firstArg) {
    return
  }

  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    const nameValue = getPropertyValue(obj, 'name') as string | null
    const descriptionValue = getPropertyValue(obj, 'description') as
      | string
      | null

    const typeValue = getPropertyValue(obj, 'type') as string | null
    const streamingValue = getPropertyValue(obj, 'streaming') as boolean | null
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
        `• No valid 'func' property for MCP endpoint '${nameValue}'.`
      )
      return
    }

    const pikkuFuncName = extractFunctionName(
      funcInitializer,
      checker
    ).pikkuFuncName

    if (!nameValue || !descriptionValue) {
      return
    }

    if (
      !matchesFilters(
        filters,
        { tags },
        { type: PikkuEventTypes.mcp, name: nameValue }
      )
    ) {
      return
    }

    state.mcpEndpoints.files.add(node.getSourceFile().fileName)
    state.mcpEndpoints.meta[nameValue] = {
      pikkuFuncName,
      name: nameValue,
      description: descriptionValue,
      type: typeValue as 'tool' | 'resource',
      ...(streamingValue !== null && { streaming: streamingValue }),
      docs,
      tags,
    }
  }
}
