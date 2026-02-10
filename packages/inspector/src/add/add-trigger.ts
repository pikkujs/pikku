import * as ts from 'typescript'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { AddWiring } from '../types.js'
import {
  extractFunctionName,
  makeContextBasedId,
} from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { extractWireNames } from '../utils/post-process.js'
import { resolveExternalPackageName } from '../utils/resolve-external-package.js'

import { ErrorCode } from '../error-codes.js'
export const addTrigger: AddWiring = (
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

  if (!ts.isIdentifier(expression)) {
    return
  }

  if (expression.text === 'wireTrigger') {
    addWireTrigger(logger, node, checker, state, firstArg)
  } else if (expression.text === 'wireTriggerSource') {
    addWireTriggerSource(logger, node, checker, state, options, firstArg)
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
  const { disabled, tags, summary, description, errors } =
    getCommonWireMetaData(obj, 'Trigger', nameValue, logger)

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
      `No valid 'func' property for trigger '${nameValue}'.`
    )
    return
  }

  const extracted = extractFunctionName(funcInitializer, checker, state.rootDir)
  let pikkuFuncId = extracted.pikkuFuncId
  if (pikkuFuncId.startsWith('__temp_') && nameValue) {
    pikkuFuncId = makeContextBasedId('trigger', nameValue)
  }

  if (!nameValue) {
    return
  }

  // --- resolve middleware ---
  const middleware = resolveMiddleware(state, obj, tags, checker)

  // --- track used functions/middleware for service aggregation ---
  state.serviceAggregation.usedFunctions.add(pikkuFuncId)
  extractWireNames(middleware).forEach((name) =>
    state.serviceAggregation.usedMiddleware.add(name)
  )

  state.triggers.files.add(node.getSourceFile().fileName)
  state.triggers.meta[nameValue] = {
    pikkuFuncId,
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
  options: Parameters<AddWiring>[4],
  firstArg: ts.Expression | undefined
) => void = (logger, node, checker, state, options, firstArg) => {
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

  if (ts.isIdentifier(funcInitializer)) {
    const packageName = resolveExternalPackageName(
      funcInitializer,
      checker,
      options.externalPackages
    )
    state.triggers.sourceMeta[nameValue] = {
      name: nameValue,
      pikkuFuncId: funcInitializer.text,
      packageName: packageName || undefined,
    }
  }

  state.triggers.files.add(node.getSourceFile().fileName)
}
