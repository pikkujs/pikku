import * as ts from 'typescript'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { pathToRegexp } from 'path-to-regexp'
import { HTTPMethod } from '@pikku/core/http'
import { extractFunctionName } from '../utils/extract-function-name.js'
import {
  getPropertyAssignmentInitializer,
  extractTypeKeys,
} from '../utils/type-utils.js'
import { AddWiring, InspectorState } from '../types.js'
import { resolveHTTPMiddlewareFromObject } from '../utils/middleware.js'
import { resolveHTTPPermissionsFromObject } from '../utils/permissions.js'
import { extractWireNames } from '../utils/post-process.js'
import { ensureFunctionMetadata } from '../utils/ensure-function-metadata.js'
import { ErrorCode } from '../error-codes.js'
import { detectSchemaVendorOrError } from '../utils/detect-schema-vendor.js'

import type { InspectorLogger } from '../types.js'

/**
 * Extract header schema reference from headers.request property
 */
export const extractHeadersSchema = (
  obj: ts.ObjectLiteralExpression,
  routeName: string,
  method: string,
  state: InspectorState,
  checker: ts.TypeChecker,
  logger: InspectorLogger
): string | undefined => {
  const headersNode = getPropertyAssignmentInitializer(
    obj,
    'headers',
    true,
    checker
  )
  if (!headersNode || !ts.isIdentifier(headersNode)) return undefined

  // Resolve the schema reference
  const symbol = checker.getSymbolAtLocation(headersNode)
  if (!symbol) return undefined

  const decl = symbol.valueDeclaration || symbol.declarations?.[0]
  if (!decl) return undefined

  let sourceFile: string
  if (ts.isImportSpecifier(decl)) {
    const aliasedSymbol = checker.getAliasedSymbol(symbol)
    if (aliasedSymbol) {
      const aliasedDecl =
        aliasedSymbol.valueDeclaration || aliasedSymbol.declarations?.[0]
      if (aliasedDecl) {
        sourceFile = aliasedDecl.getSourceFile().fileName
      } else {
        return undefined
      }
    } else {
      return undefined
    }
  } else {
    sourceFile = decl.getSourceFile().fileName
  }

  const vendor = detectSchemaVendorOrError(
    headersNode,
    checker,
    logger,
    `Route '${routeName}' header`,
    sourceFile
  )
  if (!vendor) return undefined

  // Create a sanitized schema name from route and method to avoid collisions
  const sanitizedRoute = routeName
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/^_+|_+$/g, '')
  const schemaName = `${method.toUpperCase()}_${sanitizedRoute}_Headers`

  state.schemaLookup.set(schemaName, {
    variableName: headersNode.text,
    sourceFile,
    vendor,
  })

  return schemaName
}

/**
 * Populate metaInputTypes for a given route based on method, input type,
 * query and params. Returns undefined (we only mutate metaTypes).
 */
export const getInputTypes = (
  metaTypes: Map<
    string,
    { query?: string[]; params?: string[]; body?: string[] }
  >,
  methodType: string,
  inputType: string | null,
  queryValues: string[],
  paramsValues: string[]
): undefined => {
  if (!inputType) return
  metaTypes.set(inputType, {
    query: queryValues,
    params: paramsValues,
    body: ['post', 'put', 'patch'].includes(methodType)
      ? [...new Set([...queryValues, ...paramsValues])]
      : [],
  })
  return
}

/**
 * Simplified wireHTTP: re-uses function metadata from state.functions.meta
 * instead of re-inferring types here.
 */
export const addHTTPRoute: AddWiring = (
  logger,
  node,
  checker,
  state,
  options
) => {
  // only look at calls
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node
  if (!ts.isIdentifier(expression) || expression.text !== 'wireHTTP') return

  // must pass an object literal
  const firstArg = args[0]
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return
  const obj = firstArg

  // --- extract HTTP metadata ---
  const route = getPropertyValue(obj, 'route') as string | null
  if (!route) return

  const keys = pathToRegexp(route).keys
  const params = keys.filter((k) => k.type === 'param').map((k) => k.name)

  const method =
    (getPropertyValue(obj, 'method') as string)?.toLowerCase() || 'get'
  const { title, tags, summary, description, errors } = getCommonWireMetaData(
    obj,
    'HTTP route',
    route,
    logger
  )
  const query = (getPropertyValue(obj, 'query') as string[]) || []

  // Check if this is a workflow trigger (workflow: true)
  const isWorkflowTrigger = getPropertyValue(obj, 'workflow') === true
  if (isWorkflowTrigger) {
    // Workflow triggers don't need func - they're handled by workflow-utils
    // Just record the route for HTTP meta but skip function processing
    state.http.files.add(node.getSourceFile().fileName)
    state.http.meta[method][route] = {
      pikkuFuncName: '', // No function - workflow handles it
      route,
      method: method as HTTPMethod,
      params: params.length > 0 ? params : undefined,
      query: query.length > 0 ? query : undefined,
      inputTypes: undefined,
      title,
      summary,
      description,
      errors,
      tags,
      workflow: true,
    }
    return
  }

  // --- find the referenced function name first for filtering ---
  const funcInitializer = getPropertyAssignmentInitializer(
    obj,
    'func',
    true,
    checker
  )
  if (!funcInitializer) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      `No valid 'func' property for route '${route}'.`
    )
    return
  }

  const funcName = extractFunctionName(
    funcInitializer,
    checker,
    state.rootDir
  ).pikkuFuncName

  // Ensure function metadata exists (creates stub for inline functions)
  ensureFunctionMetadata(state, funcName, route)

  // lookup existing function metadata
  const fnMeta = state.functions.meta[funcName]
  if (!fnMeta) {
    logger.critical(
      ErrorCode.FUNCTION_METADATA_NOT_FOUND,
      `No function metadata found for '${funcName}'.`
    )
    return
  }
  const input = fnMeta.inputs?.[0] || null

  // --- validate route params and query params exist in function input type ---
  if (params.length > 0 || query.length > 0) {
    const inputTypes = state.typesLookup.get(funcName)
    if (inputTypes && inputTypes.length > 0) {
      const inputKeys = extractTypeKeys(inputTypes[0])

      // Check path params
      if (params.length > 0) {
        const missingParams = params.filter((p) => !inputKeys.includes(p))
        if (missingParams.length > 0) {
          logger.critical(
            ErrorCode.ROUTE_PARAM_MISMATCH,
            `Route '${route}' has path parameter(s) [${missingParams.join(', ')}] ` +
              `not found in function '${funcName}' input type. ` +
              `Input type has: [${inputKeys.join(', ')}]`
          )
          return
        }
      }

      // Check query params
      if (query.length > 0) {
        const missingQuery = query.filter((q) => !inputKeys.includes(q))
        if (missingQuery.length > 0) {
          logger.critical(
            ErrorCode.ROUTE_QUERY_MISMATCH,
            `Route '${route}' has query parameter(s) [${missingQuery.join(', ')}] ` +
              `not found in function '${funcName}' input type. ` +
              `Input type has: [${inputKeys.join(', ')}]`
          )
          return
        }
      }
    }
  }

  // --- compute inputTypes (body/query/params) ---
  const inputTypes = getInputTypes(
    state.http.metaInputTypes,
    method,
    input,
    query,
    params
  )

  // --- resolve middleware ---
  const middleware = resolveHTTPMiddlewareFromObject(
    state,
    route,
    obj,
    tags,
    checker
  )

  // --- resolve permissions ---
  const permissions = resolveHTTPPermissionsFromObject(
    state,
    route,
    obj,
    tags,
    checker
  )

  // --- extract header schema ---
  const headersSchemaName = extractHeadersSchema(
    obj,
    route,
    method,
    state,
    checker,
    logger
  )

  // --- track used functions/middleware/permissions for service aggregation ---
  state.serviceAggregation.usedFunctions.add(funcName)
  extractWireNames(middleware).forEach((name) =>
    state.serviceAggregation.usedMiddleware.add(name)
  )
  extractWireNames(permissions).forEach((name) =>
    state.serviceAggregation.usedPermissions.add(name)
  )

  // --- record route ---
  state.http.files.add(node.getSourceFile().fileName)
  state.http.meta[method][route] = {
    pikkuFuncName: funcName,
    route,
    method: method as HTTPMethod,
    params: params.length > 0 ? params : undefined,
    query: query.length > 0 ? query : undefined,
    inputTypes,
    title,
    summary,
    description,
    errors,
    tags,
    middleware,
    permissions,
    headersSchemaName,
  }
}
