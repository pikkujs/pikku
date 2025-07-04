import * as ts from 'typescript'
import { getPropertyValue } from './get-property-value.js'
import { APIDocs } from '@pikku/core'
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

  // Check if the call is to addMCPResource, addMCPTool, or addMCPEndpoint
  if (
    !ts.isIdentifier(expression) ||
    !['addMCPResource', 'addMCPTool', 'addMCPEndpoint'].includes(
      expression.text
    )
  ) {
    return
  }

  const endpointType =
    expression.text === 'addMCPResource'
      ? 'resource'
      : expression.text === 'addMCPTool'
        ? 'tool'
        : undefined // will be determined from the object

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

    // Determine the endpoint type
    const finalType = endpointType || typeValue || 'tool' // default to tool

    if (
      !matchesFilters(
        filters,
        { tags },
        { type: 'mcpEndpoint', name: nameValue }
      )
    ) {
      return
    }

    state.mcpEndpoints.files.add(node.getSourceFile().fileName)
    state.mcpEndpoints.meta[nameValue] = {
      pikkuFuncName,
      name: nameValue,
      description: descriptionValue,
      type: finalType as 'tool' | 'resource',
      ...(streamingValue !== null && { streaming: streamingValue }),
      docs,
      tags,
    }
  }
}
