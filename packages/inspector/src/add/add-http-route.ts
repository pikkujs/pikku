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
 * Parameters for registering an HTTP route
 */
export interface RegisterHTTPRouteParams {
  obj: ts.ObjectLiteralExpression
  state: InspectorState
  checker: ts.TypeChecker
  logger: InspectorLogger
  sourceFile: ts.SourceFile
  basePath?: string
  inheritedTags?: string[]
}

/**
 * Extract header schema reference from headers property
 */
const extractHeadersSchema = (
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
 * query and params.
 */
const computeInputTypes = (
  metaTypes: Map<
    string,
    { query?: string[]; params?: string[]; body?: string[] }
  >,
  methodType: string,
  inputType: string | null,
  queryValues: string[],
  paramsValues: string[]
): void => {
  if (!inputType) return
  metaTypes.set(inputType, {
    query: queryValues,
    params: paramsValues,
    body: ['post', 'put', 'patch'].includes(methodType)
      ? [...new Set([...queryValues, ...paramsValues])]
      : [],
  })
}

/**
 * Shared function to register an HTTP route in the inspector state.
 * Used by both wireHTTP and wireHTTPRoutes.
 */
export function registerHTTPRoute({
  obj,
  state,
  checker,
  logger,
  sourceFile,
  basePath = '',
  inheritedTags = [],
}: RegisterHTTPRouteParams): void {
  // Extract route path
  const routePath = getPropertyValue(obj, 'route') as string | null
  if (!routePath) return

  const method = (
    (getPropertyValue(obj, 'method') as string) || 'get'
  ).toLowerCase()
  const fullRoute = basePath + routePath

  // Extract params from route path
  let params: string[] = []
  try {
    const keys = pathToRegexp(fullRoute).keys
    params = keys.filter((k) => k.type === 'param').map((k) => k.name)
  } catch (e) {
    logger.error(
      `Failed to parse route '${fullRoute}': ${e instanceof Error ? e.message : e}`
    )
    return
  }

  // Get common metadata
  const {
    disabled,
    title,
    tags: routeTags,
    summary,
    description,
    errors,
  } = getCommonWireMetaData(obj, 'HTTP route', fullRoute, logger)

  if (disabled) return

  // Merge inherited tags with route tags
  const tags = [...inheritedTags, ...(routeTags || [])]

  const query = (getPropertyValue(obj, 'query') as string[]) || []

  // Get function reference
  const funcInitializer = getPropertyAssignmentInitializer(
    obj,
    'func',
    true,
    checker
  )
  if (!funcInitializer) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      `No valid 'func' property for route '${fullRoute}'.`
    )
    return
  }

  const funcName = extractFunctionName(
    funcInitializer,
    checker,
    state.rootDir
  ).pikkuFuncName

  // Ensure function metadata exists
  ensureFunctionMetadata(state, funcName, fullRoute)

  // Lookup existing function metadata
  const fnMeta = state.functions.meta[funcName]
  if (!fnMeta) {
    logger.critical(
      ErrorCode.FUNCTION_METADATA_NOT_FOUND,
      `No function metadata found for '${funcName}'.`
    )
    return
  }
  const input = fnMeta.inputs?.[0] || null

  // Validate that route params and query params exist in function input type
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
            `Route '${fullRoute}' has path parameter(s) [${missingParams.join(', ')}] ` +
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
            `Route '${fullRoute}' has query parameter(s) [${missingQuery.join(', ')}] ` +
              `not found in function '${funcName}' input type. ` +
              `Input type has: [${inputKeys.join(', ')}]`
          )
          return
        }
      }
    }
  }

  // Compute inputTypes (body/query/params)
  computeInputTypes(state.http.metaInputTypes, method, input, query, params)

  // Resolve middleware
  const middleware = resolveHTTPMiddlewareFromObject(
    state,
    fullRoute,
    obj,
    tags,
    checker
  )

  // Resolve permissions
  const permissions = resolveHTTPPermissionsFromObject(
    state,
    fullRoute,
    obj,
    tags,
    checker
  )

  // Track used functions/middleware/permissions for service aggregation
  state.serviceAggregation.usedFunctions.add(funcName)
  extractWireNames(middleware).forEach((name) =>
    state.serviceAggregation.usedMiddleware.add(name)
  )
  extractWireNames(permissions).forEach((name) =>
    state.serviceAggregation.usedPermissions.add(name)
  )

  // Check for SSE
  const sse = getPropertyValue(obj, 'sse') === true

  // Extract header schema
  const headersSchemaName = extractHeadersSchema(
    obj,
    fullRoute,
    method,
    state,
    checker,
    logger
  )

  // Record route
  state.http.files.add(sourceFile.fileName)
  state.http.meta[method][fullRoute] = {
    pikkuFuncName: funcName,
    route: fullRoute,
    method: method as HTTPMethod,
    params: params.length > 0 ? params : undefined,
    query: query.length > 0 ? query : undefined,
    inputTypes: undefined,
    title,
    summary,
    description,
    errors,
    tags: tags.length > 0 ? tags : undefined,
    middleware,
    permissions,
    sse: sse ? true : undefined,
    headersSchemaName,
    groupBasePath: basePath || undefined,
  }
}

/**
 * Process wireHTTP calls
 */
export const addHTTPRoute: AddWiring = (
  logger,
  node,
  checker,
  state,
  _options
) => {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node
  if (!ts.isIdentifier(expression) || expression.text !== 'wireHTTP') return

  const firstArg = args[0]
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return

  registerHTTPRoute({
    obj: firstArg,
    state,
    checker,
    logger,
    sourceFile: node.getSourceFile(),
  })
}
