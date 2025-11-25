import * as ts from 'typescript'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import type { ForgeNodeType } from '@pikku/core/forge-node'

/**
 * Inspector for wireForgeNode calls.
 * Extracts metadata for Forge workflow builder nodes.
 * Note: wireForgeNode is metadata-only - no runtime behavior.
 */
export const addForgeNode: AddWiring = (
  logger,
  node,
  checker,
  state,
  _options
) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]
  const expression = node.expression

  // Check if the call is to wireForgeNode
  if (!ts.isIdentifier(expression) || expression.text !== 'wireForgeNode') {
    return
  }

  if (!firstArg) {
    return
  }

  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    const nameValue = getPropertyValue(obj, 'name') as string | null
    const displayNameValue = getPropertyValue(obj, 'displayName') as
      | string
      | null
    const categoryValue = getPropertyValue(obj, 'category') as string | null
    const typeValue = getPropertyValue(obj, 'type') as ForgeNodeType | null
    const rpcValue = getPropertyValue(obj, 'rpc') as string | null
    const iconValue = getPropertyValue(obj, 'icon') as string | null
    const errorOutputValue = getPropertyValue(obj, 'errorOutput') as
      | boolean
      | null

    const { tags, description } = getCommonWireMetaData(
      obj,
      'Forge node',
      nameValue,
      logger
    )

    // Validate required fields
    if (!nameValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        "Forge node is missing the required 'name' property."
      )
      return
    }

    if (!displayNameValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `Forge node '${nameValue}' is missing the required 'displayName' property.`
      )
      return
    }

    if (!categoryValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `Forge node '${nameValue}' is missing the required 'category' property.`
      )
      return
    }

    if (!typeValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `Forge node '${nameValue}' is missing the required 'type' property.`
      )
      return
    }

    if (!['trigger', 'action', 'end'].includes(typeValue)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Forge node '${nameValue}' has invalid type '${typeValue}'. Must be 'trigger', 'action', or 'end'.`
      )
      return
    }

    if (!rpcValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `Forge node '${nameValue}' is missing the required 'rpc' property.`
      )
      return
    }

    // Get function metadata for input/output schemas
    const fnMeta = state.functions.meta[rpcValue]
    const inputSchemaName = fnMeta?.inputs?.[0] || null
    const outputSchemaName = fnMeta?.outputs?.[0] || null

    // Note: Category validation against forge.node.categories config
    // is done at CLI build time, not during inspection

    state.forgeNodes.files.add(node.getSourceFile().fileName)

    state.forgeNodes.meta[nameValue] = {
      name: nameValue,
      displayName: displayNameValue,
      category: categoryValue,
      type: typeValue,
      rpc: rpcValue,
      description,
      icon: iconValue || undefined,
      errorOutput: errorOutputValue ?? false,
      inputSchemaName,
      outputSchemaName,
      tags,
    }
  }
}
