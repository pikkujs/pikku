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

export const addMCPResource: AddWiring = (
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
    const { disabled, tags, summary, description, errors } =
      getCommonWireMetaData(obj, 'MCP resource', uriValue, logger)

    if (disabled) return

    const streamingValue = getPropertyValue(obj, 'streaming') as boolean | null

    if (streamingValue === true) {
      logger.warn(
        `MCP resource '${uriValue}' has streaming enabled, but streaming is not yet supported.`
      )
    }

    const funcInitializer = getPropertyAssignmentInitializer(
      obj,
      'func',
      true,
      checker
    )
    if (!funcInitializer) {
      logger.critical(
        ErrorCode.MISSING_FUNC,
        `No valid 'func' property for MCP resource '${uriValue}'.`
      )
      return
    }

    const pikkuFuncName = extractFunctionName(
      funcInitializer,
      checker,
      state.rootDir
    ).pikkuFuncName

    // Ensure function metadata exists (creates stub for inline functions)
    ensureFunctionMetadata(state, pikkuFuncName, uriValue || undefined)

    if (!uriValue) {
      logger.critical(
        ErrorCode.MISSING_URI,
        "MCP resource is missing the required 'uri' property."
      )
      return
    }

    if (!titleValue) {
      logger.critical(
        ErrorCode.MISSING_TITLE,
        `MCP resource '${uriValue}' is missing the required 'title' property.`
      )
      return
    }

    if (!description) {
      logger.critical(
        ErrorCode.MISSING_DESCRIPTION,
        `MCP resource '${uriValue}' is missing a description.`
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

    state.mcpEndpoints.resourcesMeta[uriValue] = {
      pikkuFuncName,
      uri: uriValue,
      title: titleValue,
      description,
      summary,
      errors,
      ...(streamingValue !== null && { streaming: streamingValue }),
      tags,
      inputSchema,
      outputSchema,
      middleware,
      permissions,
    }
  }
}
