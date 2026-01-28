import * as ts from 'typescript'
import { pathToRegexp } from 'path-to-regexp'
import { HTTPMethod } from '@pikku/core/http'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import {
  getPropertyAssignmentInitializer,
  extractTypeKeys,
} from '../utils/type-utils.js'
import { AddWiring, InspectorState, InspectorLogger } from '../types.js'
import { resolveHTTPMiddlewareFromObject } from '../utils/middleware.js'
import { resolveHTTPPermissionsFromObject } from '../utils/permissions.js'
import { extractWireNames } from '../utils/post-process.js'
import { ensureFunctionMetadata } from '../utils/ensure-function-metadata.js'
import { ErrorCode } from '../error-codes.js'
import { getInputTypes, extractHeadersSchema } from './add-http-route.js'

/**
 * Group configuration extracted from wireHTTPRoutes or defineHTTPRoutes
 */
interface GroupConfig {
  basePath: string
  tags: string[]
  auth?: boolean
}

/**
 * Process wireHTTPRoutes calls
 */
export const addHTTPRoutes: AddWiring = (
  logger,
  node,
  checker,
  state,
  _options
) => {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node
  if (!ts.isIdentifier(expression) || expression.text !== 'wireHTTPRoutes')
    return

  const firstArg = args[0]
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return

  // Extract group config
  const groupConfig = extractGroupConfig(firstArg)

  // Get routes property
  const routesProp = getPropertyAssignment(firstArg, 'routes')
  if (!routesProp) return

  // Process routes recursively
  processRoutes(
    routesProp.initializer,
    groupConfig,
    state,
    checker,
    logger,
    node.getSourceFile()
  )
}

/**
 * Get a property assignment from an object literal
 */
function getPropertyAssignment(
  obj: ts.ObjectLiteralExpression,
  propName: string
): ts.PropertyAssignment | undefined {
  for (const prop of obj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propName
    ) {
      return prop
    }
  }
  return undefined
}

/**
 * Extract group configuration from an object literal
 */
function extractGroupConfig(obj: ts.ObjectLiteralExpression): GroupConfig {
  const basePath = (getPropertyValue(obj, 'basePath') as string) || ''
  const tags = (getPropertyValue(obj, 'tags') as string[]) || []
  const auth = getPropertyValue(obj, 'auth')

  return {
    basePath,
    tags,
    auth: auth === true ? true : auth === false ? false : undefined,
  }
}

/**
 * Merge two group configs following cascading rules
 */
function mergeConfigs(parent: GroupConfig, child: GroupConfig): GroupConfig {
  return {
    basePath: parent.basePath + child.basePath,
    tags: [...parent.tags, ...child.tags],
    auth: child.auth ?? parent.auth,
  }
}

/**
 * Check if a value is a route config (has method, func, and route)
 */
function isRouteConfig(obj: ts.ObjectLiteralExpression): boolean {
  let hasMethod = false
  let hasFunc = false
  let hasRoute = false

  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      if (prop.name.text === 'method') hasMethod = true
      if (prop.name.text === 'func') hasFunc = true
      if (prop.name.text === 'route') hasRoute = true
    }
  }

  return hasMethod && hasFunc && hasRoute
}

/**
 * Check if a value is a route contract (has routes property but no method/func)
 */
function isRouteContract(obj: ts.ObjectLiteralExpression): boolean {
  let hasRoutes = false
  let hasMethod = false
  let hasFunc = false

  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      if (prop.name.text === 'routes') hasRoutes = true
      if (prop.name.text === 'method') hasMethod = true
      if (prop.name.text === 'func') hasFunc = true
    }
  }

  return hasRoutes && !hasMethod && !hasFunc
}

/**
 * Recursively process routes - handles nested maps, contracts, and identifiers
 */
function processRoutes(
  node: ts.Node,
  parentConfig: GroupConfig,
  state: InspectorState,
  checker: ts.TypeChecker,
  logger: InspectorLogger,
  sourceFile: ts.SourceFile
): void {
  // Handle array of routes
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      if (ts.isObjectLiteralExpression(element) && isRouteConfig(element)) {
        registerRoute(element, parentConfig, state, checker, logger, sourceFile)
      }
    }
    return
  }

  // Handle object literal
  if (ts.isObjectLiteralExpression(node)) {
    // Check if this is a route config
    if (isRouteConfig(node)) {
      registerRoute(node, parentConfig, state, checker, logger, sourceFile)
      return
    }

    // Check if this is a route contract
    if (isRouteContract(node)) {
      const contractConfig = extractGroupConfig(node)
      const mergedConfig = mergeConfigs(parentConfig, contractConfig)
      const routesProp = getPropertyAssignment(node, 'routes')
      if (routesProp) {
        processRoutes(
          routesProp.initializer,
          mergedConfig,
          state,
          checker,
          logger,
          sourceFile
        )
      }
      return
    }

    // Otherwise it's a nested map - process each property
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        processRoutes(
          prop.initializer,
          parentConfig,
          state,
          checker,
          logger,
          sourceFile
        )
      }
    }
    return
  }

  // Handle identifier - resolve to its definition
  if (ts.isIdentifier(node)) {
    const resolved = resolveIdentifier(node, checker)
    if (resolved) {
      processRoutes(resolved, parentConfig, state, checker, logger, sourceFile)
    }
  }
}

/**
 * Resolve identifier to its definition (handles imports and defineHTTPRoutes)
 */
function resolveIdentifier(
  node: ts.Identifier,
  checker: ts.TypeChecker
): ts.Node | undefined {
  const symbol = checker.getSymbolAtLocation(node)
  if (!symbol) return undefined

  // Handle aliased symbols (imports)
  let resolvedSymbol = symbol
  if (resolvedSymbol.flags & ts.SymbolFlags.Alias) {
    resolvedSymbol = checker.getAliasedSymbol(resolvedSymbol) ?? resolvedSymbol
  }

  const decl =
    resolvedSymbol.valueDeclaration || resolvedSymbol.declarations?.[0]
  if (!decl) return undefined

  // Follow to the actual value (handles imports, variable declarations)
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    // Check if it's a defineHTTPRoutes call
    if (ts.isCallExpression(decl.initializer)) {
      const expr = decl.initializer.expression
      if (ts.isIdentifier(expr) && expr.text === 'defineHTTPRoutes') {
        return decl.initializer.arguments[0]
      }
    }
    return decl.initializer
  }

  return undefined
}

/**
 * Register a single route in the inspector state
 */
function registerRoute(
  obj: ts.ObjectLiteralExpression,
  groupConfig: GroupConfig,
  state: InspectorState,
  checker: ts.TypeChecker,
  logger: InspectorLogger,
  sourceFile: ts.SourceFile
): void {
  // Extract route properties
  const routePath = getPropertyValue(obj, 'route') as string | null
  if (!routePath) return

  const method = (
    (getPropertyValue(obj, 'method') as string) || 'get'
  ).toLowerCase()
  const fullRoute = groupConfig.basePath + routePath

  // Extract params from route path
  const keys = pathToRegexp(fullRoute).keys
  const params = keys.filter((k) => k.type === 'param').map((k) => k.name)

  // Get common metadata
  const {
    title,
    tags: routeTags,
    summary,
    description,
    errors,
  } = getCommonWireMetaData(obj, 'HTTP route', fullRoute, logger)

  // Merge tags
  const tags = [...groupConfig.tags, ...(routeTags || [])]

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
  getInputTypes(state.http.metaInputTypes, method, input, query, params)

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
    groupBasePath: groupConfig.basePath || undefined,
  }
}
