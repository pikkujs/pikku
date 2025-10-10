import * as ts from 'typescript'
import { getPropertyValue } from './utils/get-property-value.js'
import { PikkuWiringTypes } from '@pikku/core'
import { AddWiring } from './types.js'
import { extractFunctionName } from './utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from './utils/type-utils.js'
import { matchesFilters } from './utils/filter-utils.js'

export const addMCPPrompt: AddWiring = (
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

  // Check if the call is to wireMCPPrompt
  if (!ts.isIdentifier(expression) || expression.text !== 'wireMCPPrompt') {
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
    const tags = (getPropertyValue(obj, 'tags') as string[]) || undefined

    const funcInitializer = getPropertyAssignmentInitializer(
      obj,
      'func',
      true,
      checker
    )
    if (!funcInitializer) {
      console.error(`• No valid 'func' property for MCP prompt '${nameValue}'.`)
      return
    }

    const pikkuFuncName = extractFunctionName(
      funcInitializer,
      checker
    ).pikkuFuncName

    if (!nameValue) {
      console.error(`• MCP prompt is missing the required 'name' property.`)
      return
    }

    if (!descriptionValue) {
      console.error(`• MCP prompt '${nameValue}' is missing a description.`)
      return
    }

    const filePath = node.getSourceFile().fileName

    if (
      !matchesFilters(
        options.filters || {},
        { tags },
        { type: PikkuWiringTypes.mcp, name: nameValue, filePath },
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

    state.mcpEndpoints.promptsMeta[nameValue] = {
      pikkuFuncName,
      name: nameValue,
      description: descriptionValue,
      tags,
      inputSchema,
      outputSchema,
      arguments: [], // Will be populated by CLI during serialization
    }
  }
}
