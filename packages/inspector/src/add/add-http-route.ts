import * as ts from 'typescript'
import { getPropertyValue } from '../utils/get-property-value.js'
import { pathToRegexp } from 'path-to-regexp'
import { HTTPMethod } from '@pikku/core/http'
import { PikkuDocs, PikkuWiringTypes } from '@pikku/core'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { matchesFilters } from '../utils/filter-utils.js'
import { AddWiring } from '../types.js'
import { resolveHTTPMiddlewareFromObject } from '../utils/middleware.js'
import { resolveHTTPPermissionsFromObject } from '../utils/permissions.js'

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
  const docs = (getPropertyValue(obj, 'docs') as PikkuDocs) || undefined
  const tags = (getPropertyValue(obj, 'tags') as string[]) || undefined
  const query = (getPropertyValue(obj, 'query') as string[]) || []

  const filePath = node.getSourceFile().fileName

  if (
    !matchesFilters(
      options.filters || {},
      { tags },
      {
        type: PikkuWiringTypes.http,
        name: route,
        filePath,
        httpRoute: route,
        httpMethod: method,
      },
      logger
    )
  ) {
    return
  }

  // --- find the referenced function ---
  const funcInitializer = getPropertyAssignmentInitializer(
    obj,
    'func',
    true,
    checker
  )
  if (!funcInitializer) {
    console.error(`• No valid 'func' property for route '${route}'.`)
    return
  }

  const funcName = extractFunctionName(
    funcInitializer,
    checker,
    state.rootDir
  ).pikkuFuncName

  // lookup existing function metadata
  const fnMeta = state.functions.meta[funcName]
  if (!fnMeta) {
    console.error(`• No function metadata found for '${funcName}'.`)
    return
  }
  const input = fnMeta.inputs?.[0] || null

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

  // --- record route ---
  state.http.files.add(node.getSourceFile().fileName)
  state.http.meta[method][route] = {
    pikkuFuncName: funcName,
    route,
    method: method as HTTPMethod,
    params: params.length > 0 ? params : undefined,
    query: query.length > 0 ? query : undefined,
    inputTypes,
    docs,
    tags,
    middleware,
    permissions,
  }
}
