import * as ts from 'typescript'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { AddWiring } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { extractWireNames } from '../utils/post-process.js'

import { ErrorCode } from '../error-codes.js'
export const addTrigger: AddWiring = (
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

  if (!ts.isIdentifier(expression)) {
    return
  }

  if (expression.text === 'wireTrigger') {
    addWireTrigger(logger, node, checker, state, firstArg)
  } else if (expression.text === 'wireTriggerSource') {
    addWireTriggerSource(logger, node, checker, state, firstArg)
  }
}

const addWireTrigger: (
  logger: Parameters<AddWiring>[0],
  node: ts.CallExpression,
  checker: Parameters<AddWiring>[2],
  state: Parameters<AddWiring>[3],
  firstArg: ts.Expression | undefined
) => void = (logger, node, checker, state, firstArg) => {
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    return
  }

  const obj = firstArg

  const nameValue = getPropertyValue(obj, 'name') as string | null
  const { tags, summary, description, errors } = getCommonWireMetaData(
    obj,
    'Trigger',
    nameValue,
    logger
  )

  const funcInitializer = getPropertyAssignmentInitializer(
    obj,
    'func',
    true,
    checker
  )
  if (!funcInitializer) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      `No valid 'func' property for trigger '${nameValue}'.`
    )
    return
  }

  const pikkuFuncName = extractFunctionName(
    funcInitializer,
    checker,
    state.rootDir
  ).pikkuFuncName

  if (!nameValue) {
    return
  }

  // --- resolve middleware ---
  const middleware = resolveMiddleware(state, obj, tags, checker)

  // --- track used functions/middleware for service aggregation ---
  state.serviceAggregation.usedFunctions.add(pikkuFuncName)
  extractWireNames(middleware).forEach((name) =>
    state.serviceAggregation.usedMiddleware.add(name)
  )

  state.triggers.files.add(node.getSourceFile().fileName)
  state.triggers.meta[nameValue] = {
    pikkuFuncName,
    name: nameValue,
    summary,
    description,
    errors,
    tags,
    middleware,
  }
}

const addWireTriggerSource: (
  logger: Parameters<AddWiring>[0],
  node: ts.CallExpression,
  checker: Parameters<AddWiring>[2],
  state: Parameters<AddWiring>[3],
  firstArg: ts.Expression | undefined
) => void = (logger, node, checker, state, firstArg) => {
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    return
  }

  const obj = firstArg

  const nameValue = getPropertyValue(obj, 'name') as string | null
  if (!nameValue) {
    return
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
      `No valid 'func' property for trigger source '${nameValue}'.`
    )
    return
  }

  const pikkuFuncName = extractFunctionName(
    funcInitializer,
    checker,
    state.rootDir
  ).pikkuFuncName

  // Derive the source function name (same convention as runtime)
  const sourceFuncName = `${pikkuFuncName}__source`

  // Register function meta for the source at build time
  state.functions.meta[sourceFuncName] = {
    pikkuFuncName: sourceFuncName,
    inputSchemaName: null,
    outputSchemaName: null,
  }

  state.triggers.files.add(node.getSourceFile().fileName)
}
