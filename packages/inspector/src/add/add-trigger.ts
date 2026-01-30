import * as ts from 'typescript'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { AddWiring } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'

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

  if (!ts.isIdentifier(expression) || expression.text !== 'wireTrigger') {
    return
  }

  if (!firstArg) {
    return
  }

  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    const nameValue = getPropertyValue(obj, 'name') as string | null
    const { tags, summary, description } = getCommonWireMetaData(
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

    state.serviceAggregation.usedFunctions.add(pikkuFuncName)

    state.triggers.files.add(node.getSourceFile().fileName)
    state.triggers.meta[nameValue] = {
      pikkuFuncName,
      name: nameValue,
      description: description || summary,
      tags,
    }
  }
}
