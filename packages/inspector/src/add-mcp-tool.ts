import * as ts from 'typescript'
import { getPropertyValue } from './get-property-value.js'
import { PikkuEventTypes } from '@pikku/core'
import { InspectorFilters, InspectorState, InspectorLogger } from './types.js'
import {
  extractFunctionName,
  getPropertyAssignmentInitializer,
  matchesFilters,
} from './utils.js'

export const addMCPTool = (
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

  // Check if the call is to addMCPTool
  if (!ts.isIdentifier(expression) || expression.text !== 'addMCPTool') {
    return
  }

  if (!firstArg) {
    return
  }

  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    const nameValue = getPropertyValue(obj, 'name') as string | null
    const titleValue = getPropertyValue(obj, 'title') as string | null
    const descriptionValue = getPropertyValue(obj, 'description') as
      | string
      | null
    const streamingValue = getPropertyValue(obj, 'streaming') as boolean | null
    const tags = (getPropertyValue(obj, 'tags') as string[]) || undefined

    const funcInitializer = getPropertyAssignmentInitializer(
      obj,
      'func',
      true,
      checker
    )
    if (!funcInitializer) {
      console.error(`• No valid 'func' property for MCP tool '${nameValue}'.`)
      return
    }

    const pikkuFuncName = extractFunctionName(
      funcInitializer,
      checker
    ).pikkuFuncName

    if (!nameValue) {
      console.error(`• MCP tool is missing the required 'name' property.`)
      return
    }

    if (!descriptionValue) {
      console.error(`• MCP tool '${nameValue}' is missing a description.`)
      return
    }

    const filePath = node.getSourceFile().fileName

    if (
      !matchesFilters(
        filters,
        { tags },
        { type: PikkuEventTypes.mcp, name: nameValue, filePath },
        logger
      )
    ) {
      return
    }

    // lookup existing function metadata
    const fnMeta = state.functions.meta[pikkuFuncName]
    if (!fnMeta) {
      console.error(`• No function metadata found for '${pikkuFuncName}'.`)
      return
    }
    const inputSchema = fnMeta.inputs?.[0] || null
    const outputSchema = fnMeta.outputs?.[0] || null

    state.mcpEndpoints.files.add(node.getSourceFile().fileName)

    state.mcpEndpoints.toolsMeta[nameValue] = {
      pikkuFuncName,
      name: nameValue,
      title: titleValue || undefined,
      description: descriptionValue,
      ...(streamingValue !== null && { streaming: streamingValue }),
      tags,
      inputSchema,
      outputSchema,
    }
  }
}
