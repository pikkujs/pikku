import * as ts from 'typescript'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import type { AddWiring } from '../types.js'
import {
  extractFunctionName,
  makeContextBasedId,
} from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { extractWireNames } from '../utils/post-process.js'
import { resolveAddonName } from '../utils/resolve-addon-package.js'
import type { GatewayTransportType } from '@pikku/core/gateway'

import { ErrorCode } from '../error-codes.js'

export const addGateway: AddWiring = (
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

  if (!ts.isIdentifier(expression) || expression.text !== 'wireGateway') {
    return
  }

  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    return
  }

  const obj = firstArg

  const nameValue = getPropertyValue(obj, 'name') as string | null
  const typeValue = getPropertyValue(obj, 'type') as GatewayTransportType | null
  const routeValue = getPropertyValue(obj, 'route') as string | undefined
  const { disabled, tags, summary, description, errors } =
    getCommonWireMetaData(obj, 'Gateway', nameValue, logger)

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
      `No valid 'func' property for gateway '${nameValue}'.`
    )
    return
  }

  const extracted = extractFunctionName(funcInitializer, checker, state.rootDir)
  let pikkuFuncId = extracted.pikkuFuncId
  if (pikkuFuncId.startsWith('__temp_') && nameValue) {
    pikkuFuncId = makeContextBasedId('gateway', nameValue)
  }

  const packageName = ts.isIdentifier(funcInitializer)
    ? resolveAddonName(funcInitializer, checker, state.rpc.wireAddonDeclarations)
    : null

  if (!nameValue || !typeValue) {
    return
  }

  const middleware = resolveMiddleware(state, obj, tags, checker)

  state.serviceAggregation.usedFunctions.add(pikkuFuncId)
  extractWireNames(middleware).forEach((name) =>
    state.serviceAggregation.usedMiddleware.add(name)
  )

  state.gateways.files.add(node.getSourceFile().fileName)
  state.gateways.meta[nameValue] = {
    pikkuFuncId,
    ...(packageName && { packageName }),
    name: nameValue,
    type: typeValue,
    route: routeValue,
    gateway: true,
    summary,
    description,
    errors,
    tags,
    middleware,
  }
}
