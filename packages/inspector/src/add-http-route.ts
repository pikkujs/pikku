import * as ts from 'typescript'
import { getPropertyValue } from './get-property-value.js'
import { pathToRegexp } from 'path-to-regexp'
import { HTTPMethod } from '@pikku/core/http'
import { APIDocs } from '@pikku/core'
import { extractTypeKeys, getFunctionTypesFromObject, matchesFilters } from './utils.js'
import { MetaInputTypes, InspectorState, InspectorFilters } from './types.js'

export const getInputTypes = (
  metaTypes: MetaInputTypes,
  methodType: string,
  inputType: string | null,
  queryValues: string[],
  paramsValues: string[]
) => {
  if (!inputType) {
    return undefined
  }

  if (inputType) {
    metaTypes.set(inputType, {
      query: queryValues,
      params: paramsValues,
      body: ['post', 'put', 'patch'].includes(methodType)
        ? [...new Set([...queryValues, ...paramsValues])]
        : [],
    })
  }

  return undefined
}

export const addRoute = (
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  filters: InspectorFilters
) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]
  const expression = node.expression

  // Check if the call is to addRoute
  if (!ts.isIdentifier(expression) || expression.text !== 'addRoute') {
    return
  }

  if (!firstArg) {
    return
  }

  let docs: APIDocs | undefined
  let methodValue: string | null = null
  let paramsValues: string[] | null = []
  let queryValues: string[] | [] = []
  let tags: string[] | [] = []
  let routeValue: string | null = null

  // Check if the first argument is an object literal
  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    routeValue = getPropertyValue(obj, 'route') as string | null
    if (!routeValue) {
      return
    }

    const { keys } = pathToRegexp(routeValue)
    paramsValues = keys.reduce((result, { type, name }) => {
      if (type === 'param') {
        result.push(name)
      }
      return result
    }, [] as string[])

    docs = (getPropertyValue(obj, 'docs') as APIDocs) || undefined
    methodValue = getPropertyValue(obj, 'method') as string
    queryValues = (getPropertyValue(obj, 'query') as string[]) || []
    tags = (getPropertyValue(obj, 'tags') as string[]) || undefined

    if (
      !matchesFilters(filters, { tags }, { type: 'http', name: routeValue })
    ) {
      return
    }

    let { inputs, outputs, inputTypes } = getFunctionTypesFromObject(checker, obj, true, {
      funcName: 'func',
      inputIndex: 0,
      outputIndex: 1,
      typesMap: state.http.typesMap,
    })

    const input = inputs ? inputs[0] || null : null
    const output = outputs ? outputs[0] || null : null

    if (inputs && inputs?.length > 1) {
      console.error(
        `Only one input type is currently allowed for method '${methodValue}' and route '${routeValue}': \n\t${inputs.join('\n\t')}`
      )
    }

    if (outputs && outputs?.length > 1) {
      console.error(
        `Only one output type is currently allowed for method '${methodValue}' and route '${routeValue}': \n\t${outputs.join('\n\t')}`
      )
    }

    if (inputTypes[0] && !['post', 'put', 'patch'].includes(methodValue)) {
      queryValues = [
        ...new Set([...queryValues, ...extractTypeKeys(inputTypes[0])]),
      ].filter((query) => !paramsValues?.includes(query))
    }

    state.http.files.add(node.getSourceFile().fileName)
    state.http.meta.push({
      route: routeValue,
      method: methodValue! as HTTPMethod,
      input,
      output,
      params: paramsValues.length > 0 ? paramsValues : undefined,
      query: queryValues.length > 0 ? queryValues : undefined,
      inputTypes: getInputTypes(
        state.http.metaInputTypes,
        methodValue,
        input,
        queryValues,
        paramsValues
      ),
      docs,
      tags,
    })
  }
}
