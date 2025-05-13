import * as ts from 'typescript'
import { getPropertyValue } from './get-property-value.js'
import { pathToRegexp } from 'path-to-regexp'
import { APIDocs } from '@pikku/core'
import { getInputTypes } from './add-http-route.js'
import {
  extractFunctionName,
  getPropertyAssignment,
  matchesFilters,
} from './utils.js'
import type { ChannelMessageMeta, ChannelMeta } from '@pikku/core/channel'
import type { InspectorFilters, InspectorState } from './types.js'

/**
 * Safely get the “initializer” expression of a property-like AST node:
 * - for `foo: expr`, returns `expr`
 * - for `{ foo }` shorthand, returns the identifier `foo`
 * - otherwise, returns undefined
 */
function getInitializerOf(
  elem: ts.ObjectLiteralElementLike
): ts.Expression | undefined {
  if (ts.isPropertyAssignment(elem)) {
    return elem.initializer
  }
  if (ts.isShorthandPropertyAssignment(elem)) {
    return elem.name
  }
  return undefined
}

/**
 * Resolve a handler expression (Identifier, CallExpression, or { func })
 * into its underlying function name.
 */
function getHandlerNameFromExpression(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) {
    return expr.text
  }
  if (ts.isCallExpression(expr)) {
    const { funcName } = extractFunctionName(expr)
    return funcName
  }
  if (ts.isObjectLiteralExpression(expr)) {
    const fnProp = getPropertyAssignment(expr, 'func')
    if (fnProp) {
      const inner = getInitializerOf(fnProp)
      if (inner) return getHandlerNameFromExpression(inner)
    }
  }
  return null
}

/**
 * Build out the nested message-routes by looking up each handler
 * in state.functions.meta instead of re-inferring it here.
 */
export function addMessagesRoutes(
  obj: ts.ObjectLiteralExpression,
  state: InspectorState
): ChannelMeta['messageRoutes'] {
  const result: ChannelMeta['messageRoutes'] = {}
  const onMsgRouteProp = getPropertyAssignment(obj, 'onMessageRoute')
  if (!onMsgRouteProp) return result

  const top = getInitializerOf(onMsgRouteProp)
  if (!top || !ts.isObjectLiteralExpression(top)) return result

  for (const chanElem of top.properties) {
    const chanInit = getInitializerOf(chanElem)
    if (!chanInit || !ts.isObjectLiteralExpression(chanInit)) continue

    const channelKey = chanElem.name!.getText()
    result[channelKey] = {}

    for (const routeElem of chanInit.properties) {
      const init = getInitializerOf(routeElem)
      if (!init) continue

      const routeKey = routeElem.name!.getText()
      const handlerName = getHandlerNameFromExpression(init)
      if (!handlerName) {
        console.error(
          `Could not resolve handler for message route '${routeKey}'`
        )
        continue
      }

      const fnMeta = state.functions.meta[handlerName]
      if (!fnMeta) {
        console.error(`No function metadata found for handler '${handlerName}'`)
        continue
      }

      result[channelKey]![routeKey] = {
        inputs: fnMeta.inputs ?? null,
        outputs: fnMeta.outputs ?? null,
      }
    }
  }

  return result
}

/**
 * Inspect addChannel calls, look up all handlers in state.functions.meta,
 * and emit one entry into state.channels.meta.
 */
export function addChannel(
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  filters: InspectorFilters
) {
  if (!ts.isCallExpression(node)) return
  const { expression, arguments: args } = node
  if (!ts.isIdentifier(expression) || expression.text !== 'addChannel') return
  const first = args[0]
  if (!first || !ts.isObjectLiteralExpression(first)) return

  const obj = first
  const name = getPropertyValue(obj, 'name') as string | undefined
  const route = (getPropertyValue(obj, 'route') as string) ?? ''

  if (!name) {
    console.error('Channel name is required')
    return
  }

  // path parameters
  const params = route
    ? pathToRegexp(route)
        .keys.filter((k) => k.type === 'param')
        .map((k) => k.name)
    : []

  const docs = getPropertyValue(obj, 'docs') as APIDocs | undefined
  const tags = getPropertyValue(obj, 'tags') as string[] | undefined
  const query = getPropertyValue(obj, 'query') as string[] | []

  if (!matchesFilters(filters, { tags }, { type: 'channel', name })) return

  const connect = Boolean(getPropertyAssignment(obj, 'onConnect', false))
  const disconnect = Boolean(getPropertyAssignment(obj, 'onDisconnect', false))

  // default onMessage handler
  let message: ChannelMessageMeta | null = null
  const onMsgProp = getPropertyAssignment(obj, 'onMessage', false)
  if (onMsgProp) {
    const init = getInitializerOf(onMsgProp)
    const handlerName = init && getHandlerNameFromExpression(init)
    const fnMeta = handlerName && state.functions.meta[handlerName]
    if (!fnMeta) {
      console.error(
        `No function metadata for onMessage handler '${handlerName}'`
      )
    } else {
      message = {
        inputs: fnMeta.inputs ?? null,
        outputs: fnMeta.outputs ?? null,
      }
    }
  }

  // nested message-routes
  const messageRoutes = addMessagesRoutes(obj, state)

  // record into state
  state.channels.files.add(node.getSourceFile().fileName)
  state.channels.meta[name] ={
    name,
    route,
    input: null,
    params: params.length ? params : undefined,
    query: query?.length ? query : undefined,
    inputTypes: getInputTypes(
      state.channels.metaInputTypes,
      'get',
      message?.inputs?.[0] ?? null,
      query,
      params
    ),
    connect,
    disconnect,
    message,
    messageRoutes,
    docs: docs ?? undefined,
    tags: tags ?? undefined,
  }
}
