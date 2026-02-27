import * as ts from 'typescript'
import { getPropertyValue } from './get-property-value.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger, InspectorState } from '../types.js'

export function validateAuthSessionless(
  logger: InspectorLogger,
  obj: ts.ObjectLiteralExpression,
  state: InspectorState,
  funcName: string,
  wireDescription: string,
  inheritedAuth?: boolean
): boolean {
  const fnMeta = state.functions.meta[funcName]
  if (!fnMeta) return true

  const routeAuth = getPropertyValue(obj, 'auth')
  const resolvedAuth =
    routeAuth === true || routeAuth === false ? routeAuth : inheritedAuth
  if (resolvedAuth === false && fnMeta.sessionless === false) {
    logger.critical(
      ErrorCode.AUTH_DISABLED_REQUIRES_SESSIONLESS,
      `${wireDescription} has auth disabled but function '${funcName}' uses pikkuFunc (requires session). Use pikkuSessionlessFunc instead.`
    )
    return false
  }

  return true
}
