import * as ts from 'typescript'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { extractWireNames } from '../utils/post-process.js'
import { ensureFunctionMetadata } from '../utils/ensure-function-metadata.js'
import { AddWiring } from '../types.js'
import {
  extractFunctionName,
  makeContextBasedId,
} from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { resolvePermissions } from '../utils/permissions.js'
import { ErrorCode } from '../error-codes.js'

export const addAIAgent: AddWiring = (
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

  if (!ts.isIdentifier(expression) || expression.text !== 'wireAIAgent') {
    return
  }

  if (!firstArg) {
    return
  }

  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    const nameValue = getPropertyValue(obj, 'name') as string | null
    const { disabled, tags, summary, description, errors } =
      getCommonWireMetaData(obj, 'AI agent', nameValue, logger)

    if (disabled) return

    const instructionsValue = getPropertyValue(obj, 'instructions') as
      | string
      | string[]
      | null

    const maxStepsValue = getPropertyValue(obj, 'maxSteps') as number | null
    const toolChoiceValue = getPropertyValue(obj, 'toolChoice') as string | null

    const funcInitializer = getPropertyAssignmentInitializer(
      obj,
      'func',
      false,
      checker
    )

    let pikkuFuncId: string | undefined
    if (funcInitializer) {
      const extracted = extractFunctionName(
        funcInitializer,
        checker,
        state.rootDir
      )
      pikkuFuncId = extracted.pikkuFuncId
      if (pikkuFuncId.startsWith('__temp_') && nameValue) {
        pikkuFuncId = makeContextBasedId('agent', 'agent', nameValue)
      }

      ensureFunctionMetadata(
        state,
        pikkuFuncId,
        nameValue || undefined,
        funcInitializer,
        checker,
        extracted.isHelper
      )
    }

    if (!nameValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        "AI agent is missing the required 'name' property."
      )
      return
    }

    if (!description) {
      logger.critical(
        ErrorCode.MISSING_DESCRIPTION,
        `AI agent '${nameValue}' is missing a description.`
      )
      return
    }

    const middleware = resolveMiddleware(state, obj, tags, checker)
    const permissions = resolvePermissions(state, obj, tags, checker)

    state.serviceAggregation.usedFunctions.add(pikkuFuncId ?? nameValue)
    extractWireNames(middleware).forEach((name) =>
      state.serviceAggregation.usedMiddleware.add(name)
    )
    extractWireNames(permissions).forEach((name) =>
      state.serviceAggregation.usedPermissions.add(name)
    )

    let inputSchema: string | null = null
    let outputSchema: string | null = null
    if (pikkuFuncId) {
      const fnMeta = state.functions.meta[pikkuFuncId]
      if (fnMeta) {
        inputSchema = fnMeta.inputs?.[0] || null
        outputSchema = fnMeta.outputs?.[0] || null
      }
    }

    state.agents.files.add(node.getSourceFile().fileName)

    state.agents.agentsMeta[nameValue] = {
      pikkuFuncId,
      name: nameValue,
      description,
      instructions: instructionsValue || '',
      model: {} as any,
      summary,
      errors,
      ...(maxStepsValue !== null && { maxSteps: maxStepsValue }),
      ...(toolChoiceValue !== null && {
        toolChoice: toolChoiceValue as 'auto' | 'required' | 'none',
      }),
      tags,
      inputSchema,
      outputSchema,
      middleware,
      permissions,
    }
  }
}
