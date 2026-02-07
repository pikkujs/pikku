import * as ts from 'typescript'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { extractWireNames } from '../utils/post-process.js'
import { ensureFunctionMetadata } from '../utils/ensure-function-metadata.js'
import { AddWiring } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { resolvePermissions } from '../utils/permissions.js'
import { ErrorCode } from '../error-codes.js'

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
    const { disabled, tags, summary, description, errors } =
      getCommonWireMetaData(obj, 'MCP prompt', nameValue, logger)

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
        `No valid 'func' property for MCP prompt '${nameValue}'.`
      )
      return
    }

    const pikkuFuncName = extractFunctionName(
      funcInitializer,
      checker,
      state.rootDir
    ).pikkuFuncName

    // Ensure function metadata exists (creates stub for inline functions)
    ensureFunctionMetadata(state, pikkuFuncName, nameValue || undefined)

    if (!nameValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        "MCP prompt is missing the required 'name' property."
      )
      return
    }

    if (!description) {
      logger.critical(
        ErrorCode.MISSING_DESCRIPTION,
        `MCP prompt '${nameValue}' is missing a description.`
      )
      return
    }

    // lookup existing function metadata
    const fnMeta = state.functions.meta[pikkuFuncName]
    if (!fnMeta) {
      logger.critical(
        ErrorCode.FUNCTION_METADATA_NOT_FOUND,
        `No function metadata found for '${pikkuFuncName}'.`
      )
      return
    }
    const inputSchema = fnMeta.inputs?.[0] || null
    const outputSchema = fnMeta.outputs?.[0] || null

    // --- resolve middleware ---
    const middleware = resolveMiddleware(state, obj, tags, checker)

    // --- resolve permissions ---
    const permissions = resolvePermissions(state, obj, tags, checker)

    // --- track used functions/middleware/permissions for service aggregation ---
    state.serviceAggregation.usedFunctions.add(pikkuFuncName)
    extractWireNames(middleware).forEach((name) =>
      state.serviceAggregation.usedMiddleware.add(name)
    )
    extractWireNames(permissions).forEach((name) =>
      state.serviceAggregation.usedPermissions.add(name)
    )

    state.mcpEndpoints.files.add(node.getSourceFile().fileName)

    state.mcpEndpoints.promptsMeta[nameValue] = {
      pikkuFuncName,
      name: nameValue,
      description,
      summary,
      errors,
      tags,
      inputSchema,
      outputSchema,
      arguments: [], // Will be populated by CLI during serialization
      middleware,
      permissions,
    }
  }
}
