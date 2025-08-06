import * as ts from 'typescript'
import { getPropertyValue } from './get-property-value.js'
import { PikkuWiringTypes } from '@pikku/core'
import { InspectorFilters, InspectorState, InspectorLogger } from './types.js'
import {
  extractFunctionName,
  getPropertyAssignmentInitializer,
  matchesFilters,
} from './utils.js'

export const addMCPResource = (
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

  // Check if the call is to wireMCPResource
  if (!ts.isIdentifier(expression) || expression.text !== 'wireMCPResource') {
    return
  }

  if (!firstArg) {
    return
  }

  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    const uriValue = getPropertyValue(obj, 'uri') as string | null
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
      console.error(
        `• No valid 'func' property for MCP resource '${uriValue}'.`
      )
      return
    }

    const pikkuFuncName = extractFunctionName(
      funcInitializer,
      checker
    ).pikkuFuncName

    if (!uriValue) {
      console.error(`• MCP resource is missing the required 'uri' property.`)
      return
    }

    if (!titleValue) {
      console.error(
        `• MCP resource '${uriValue}' is missing the required 'title' property.`
      )
      return
    }

    if (!descriptionValue) {
      console.error(`• MCP resource '${uriValue}' is missing a description.`)
      return
    }

    const filePath = node.getSourceFile().fileName

    if (
      !matchesFilters(
        filters,
        { tags },
        { type: PikkuWiringTypes.mcp, name: uriValue, filePath },
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

    state.mcpEndpoints.resourcesMeta[uriValue] = {
      pikkuFuncName,
      uri: uriValue,
      title: titleValue,
      description: descriptionValue,
      ...(streamingValue !== null && { streaming: streamingValue }),
      tags,
      inputSchema,
      outputSchema,
    }
  }
}
