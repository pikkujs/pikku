import * as ts from 'typescript'
import { getPropertyValue } from './get-property-value.js'
import { pathToRegexp } from 'path-to-regexp'
import { APIDocs } from '@pikku/core'
import { getInputTypes } from './add-http-route.js'
import {
  getPropertyAssignment,
  getFunctionTypes,
  matchesFilters,
} from './utils.js'
import { ChannelMeta } from '@pikku/core/channel'
import { TypesMap } from './types-map.js'
import { InspectorFilters, InspectorState } from './types.js'

const addMessagesRoutes = (
  obj: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
  typesMap: TypesMap
) => {
  const messageTypes: ChannelMeta['messageRoutes'] = {}

  // Find the onMessageRoute property
  const messagesProperty = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === 'onMessageRoute'
  )

  if (!messagesProperty || !ts.isPropertyAssignment(messagesProperty)) {
    console.log(
      'onMessageRoute property not found or is not a valid assignment.'
    )
    return {}
  }

  const initializer = messagesProperty.initializer
  // Ensure initializer is an object literal expression
  if (!ts.isObjectLiteralExpression(initializer)) {
    console.log('onMessageRoute is not an object literal.')
    return {}
  }

  // Iterate over the first level properties (like 'event')
  initializer.properties.forEach((property) => {
    const channel = property.name!.getText()
    messageTypes[channel] = {}

    if (ts.isPropertyAssignment(property)) {
      const nestedObject = property.initializer
      if (ts.isObjectLiteralExpression(nestedObject)) {
        const keys = nestedObject.properties.map((p) => p.name?.getText())
        for (const route of keys) {
          if (route) {
            const result = getFunctionTypes(checker, nestedObject, false, {
              funcName: route,
              inputIndex: 0,
              outputIndex: 1,
              typesMap,
            })
            const inputs = result?.inputs || null
            const outputs = result?.outputs || null
            const type = result?.type || null
            messageTypes[channel][route] = { inputs, outputs, type }
          }
        }
      } else {
        console.warn('Nested property is not an object literal:', nestedObject)
      }
    } else {
      console.warn(
        `Property "${property.getText()}" is a ${ts.SyntaxKind[property.kind]}`
      )
    }
  })

  return messageTypes
}

export const addChannel = (
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
  if (!ts.isIdentifier(expression) || expression.text !== 'addChannel') {
    return
  }

  if (!firstArg) {
    return
  }

  let docs: APIDocs | undefined
  let paramsValues: string[] | null = []
  let queryValues: string[] | [] = []
  let tags: string[] | undefined = undefined
  let inputType: string | null = null
  let route: string | null = null
  let name: string | null = null

  // Check if the first argument is an object literal
  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    name = getPropertyValue(obj, 'name') as string | null
    route = getPropertyValue(obj, 'route') as string | null

    if (!name) {
      console.error('Channel name is required')
      return
    }

    if (route) {
      const { keys } = pathToRegexp(route)
      paramsValues = keys.reduce((result, { type, name }) => {
        if (type === 'param') {
          result.push(name)
        }
        return result
      }, [] as string[])
    } else {
      route = ''
    }

    docs = (getPropertyValue(obj, 'docs') as APIDocs) || undefined
    queryValues = (getPropertyValue(obj, 'query') as string[]) || []
    tags = (getPropertyValue(obj, 'tags') as string[]) || undefined

    const connect = !!getPropertyAssignment(obj, 'onConnect', false)
    const disconnect = !!getPropertyAssignment(obj, 'onDisconnect', false)
    const { inputs, outputs, type } = getFunctionTypes(checker, obj, false, {
      funcName: 'onMessage',
      inputIndex: 0,
      outputIndex: 1,
      typesMap: state.channels.typesMap,
    })
    const message = { inputs, outputs, type }
    const messageRoutes = addMessagesRoutes(
      obj,
      checker,
      state.channels.typesMap
    )

    if (!matchesFilters(filters, { tags }, { type: 'channel', name })) {
      return
    }

    state.channels.files.add(node.getSourceFile().fileName)
    state.channels.meta.push({
      name,
      route,
      input: inputType,
      params: paramsValues.length > 0 ? paramsValues : undefined,
      query: queryValues.length > 0 ? queryValues : undefined,
      inputTypes: getInputTypes(
        state.channels.metaInputTypes,
        'get',
        inputType,
        queryValues,
        paramsValues
      ),
      connect,
      disconnect,
      message: message || undefined,
      messageRoutes,
      docs,
      tags,
    })
  }
}
