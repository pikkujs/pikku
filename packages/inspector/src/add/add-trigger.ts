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

  // Detect if the source function comes from an external package
  // and set packageName and pikkuFuncName on the trigger meta entry
  if (ts.isIdentifier(funcInitializer)) {
    const packageName = resolveExternalPackageName(
      funcInitializer,
      checker,
      options.externalPackages
    )
    if (packageName && state.triggers.meta[nameValue]) {
      state.triggers.meta[nameValue].packageName = packageName
      // Use the identifier text as the function name - this is the exported name from the package
      state.triggers.meta[nameValue].pikkuFuncName = funcInitializer.text
    }
  }

  state.triggers.files.add(node.getSourceFile().fileName)
}
