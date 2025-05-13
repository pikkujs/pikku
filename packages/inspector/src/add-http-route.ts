import * as ts from 'typescript'
import { getPropertyValue } from './get-property-value.js'
import { pathToRegexp } from 'path-to-regexp'
import { HTTPMethod } from '@pikku/core/http'
import { APIDocs } from '@pikku/core'
import { matchesFilters } from './utils.js'
import { InspectorState, InspectorFilters } from './types.js'

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
 * Simplified addRoute: re-uses function metadata from state.functions.meta
 * instead of re-inferring types here.
 */
export const addRoute = (
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  filters: InspectorFilters
) => {
  // only look at calls
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node
  if (!ts.isIdentifier(expression) || expression.text !== 'addRoute') return

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
  const docs = (getPropertyValue(obj, 'docs') as APIDocs) || undefined
  const tags = (getPropertyValue(obj, 'tags') as string[]) || undefined
  const query = (getPropertyValue(obj, 'query') as string[]) || []

  if (!matchesFilters(filters, { tags }, { type: 'http', name: route })) {
    return
  }

  // --- find the referenced function ---
  const funcProp = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === 'func'
  ) as ts.PropertyAssignment | undefined

  if (!funcProp || !ts.isIdentifier(funcProp.initializer)) {
    console.error(`• No valid 'func' property for route '${route}'.`)
    return
  }
  const funcName = funcProp.initializer.text

  // lookup existing function metadata
  const fnMeta = state.functions.meta[funcName]
  if (!fnMeta) {
    console.error(`• No function metadata found for '${funcName}'.`)
    return
  }
  const input = fnMeta.inputs?.[0] || null
  const output = fnMeta.outputs?.[0] || null

  // --- compute inputTypes (body/query/params) ---
  const inputTypes = getInputTypes(
    state.http.metaInputTypes,
    method,
    input,
    query,
    params
  )

  // --- record route ---
  state.http.files.add(node.getSourceFile().fileName)
  state.http.meta.push({
    route,
    method: method as HTTPMethod,
    input,
    output,
    params: params.length > 0 ? params : undefined,
    query: query.length > 0 ? query : undefined,
    inputTypes,
    docs,
    tags,
  })
}
