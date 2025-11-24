import * as ts from 'typescript'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { pathToRegexp } from 'path-to-regexp'
import { HTTPMethod } from '@pikku/core/http'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { AddWiring } from '../types.js'
import { resolveHTTPMiddlewareFromObject } from '../utils/middleware.js'
import { resolveHTTPPermissionsFromObject } from '../utils/permissions.js'
import { extractWireNames } from '../utils/post-process.js'
import { ensureFunctionMetadata } from '../utils/ensure-function-metadata.js'
import { ErrorCode } from '../error-codes.js'

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
  const { tags, summary, description, errors } = getCommonWireMetaData(
    obj,
    'HTTP route',
    route,
    logger
  )
  const query = (getPropertyValue(obj, 'query') as string[]) || []

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

  // Detect if this function is imported from an external package
  let pikkuFuncPackage: string | undefined = undefined
  if (ts.isIdentifier(funcInitializer)) {
    const symbol = checker.getSymbolAtLocation(funcInitializer)
    if (symbol) {
      const declarations = symbol.declarations || []
      for (const decl of declarations) {
        if (ts.isImportSpecifier(decl) || ts.isImportClause(decl)) {
          // Navigate up to the import declaration
          const importDecl = decl.parent.parent.parent as ts.ImportDeclaration
          if (ts.isImportDeclaration(importDecl)) {
            const moduleSpecifier = importDecl.moduleSpecifier
            if (ts.isStringLiteral(moduleSpecifier)) {
              const importPath = moduleSpecifier.text

              // Check if this is an external npm package (not a relative import)
              // External packages start with @ (scoped) or don't start with . or /
              if (
                importPath.startsWith('@') ||
                (!importPath.startsWith('.') && !importPath.startsWith('/'))
              ) {
                pikkuFuncPackage = importPath
                logger.debug(
                  `  → External package function detected: ${importPath}`
                )
              }
            }
          }
        }
      }
    }
  }

  // For external package functions, skip function metadata lookup
  let input: string | null = null
  if (!pikkuFuncPackage) {
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
    input = fnMeta.inputs?.[0] || null
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

  // --- track used functions/middleware/permissions for service aggregation ---
  // Skip tracking external package functions
  if (!pikkuFuncPackage) {
    state.serviceAggregation.usedFunctions.add(funcName)
  }
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
    pikkuFuncPackage,
    route,
    method: method as HTTPMethod,
    params: params.length > 0 ? params : undefined,
    query: query.length > 0 ? query : undefined,
    inputTypes,
    summary,
    description,
    errors,
    tags,
    middleware,
    permissions,
  }
}
