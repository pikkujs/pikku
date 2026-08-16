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
import { ensureInlineWiringFunction } from '../utils/ensure-function-metadata.js'
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
  const routeValue = getPropertyValue(obj, 'route') as string | null
  const platformValue = getPropertyValue(obj, 'platform') as string | null
  const authValue = getPropertyValue(obj, 'auth')
  const { disabled, tags, summary, description, errors } =
    getCommonWireMetaData(obj, 'Gateway', nameValue, logger, checker)

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
    ? resolveAddonName(
        funcInitializer,
        checker,
        state.rpc.wireAddonDeclarations
      )
    : null

  if (!nameValue || !typeValue) {
    return
  }

  // Register metadata for a func inlined into the wiring (see helper).
  ensureInlineWiringFunction(
    state,
    pikkuFuncId,
    nameValue,
    funcInitializer,
    checker,
    extracted.isHelper
  )

  const middleware = resolveMiddleware(state, obj, tags, checker)

  state.serviceAggregation.usedFunctions.add(pikkuFuncId)
  extractWireNames(middleware).forEach((name) =>
    state.serviceAggregation.usedMiddleware.add(name)
  )

  // Project webhook POST/GET wrappers into compiled http + function meta.
  if (typeValue === 'webhook' && routeValue) {
    const wrappers = [
      { method: 'post', funcId: `gateway__${nameValue}__post` },
      { method: 'get', funcId: `gateway__${nameValue}__verify` },
    ] as const
    for (const { method, funcId } of wrappers) {
      // no middleware here — the gateway POST wrapper runs it itself
      state.http.meta[method][routeValue] = {
        pikkuFuncId: funcId,
        route: routeValue,
        method,
      }
      state.functions.meta[funcId] = {
        pikkuFuncId: funcId,
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless: true,
      }
    }
    state.http.files.add(node.getSourceFile().fileName)
  }

  state.gateways.files.add(node.getSourceFile().fileName)
  state.gateways.meta[nameValue] = {
    pikkuFuncId,
    ...(packageName && { packageName }),
    name: nameValue,
    type: typeValue,
    ...(routeValue && { route: routeValue }),
    ...(platformValue && { platform: platformValue }),
    ...(typeof authValue === 'boolean' && { auth: authValue }),
    gateway: true,
    summary,
    description,
    errors,
    tags,
    middleware,
  }
}
