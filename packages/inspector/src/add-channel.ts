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
import { ChannelMeta } from '@pikku/core/channel'
import { InspectorFilters, InspectorState } from './types.js'

export function addMessagesRoutes(
    obj: ts.ObjectLiteralExpression,
    state: InspectorState
): ChannelMeta['messageRoutes'] {
    const routes: ChannelMeta['messageRoutes'] = {}

    // find the onMessageRoute property
    const onMsgProp = obj.properties.find(
        p =>
            ts.isPropertyAssignment(p) &&
            (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
            p.name.getText() === 'onMessageRoute'
    ) as ts.PropertyAssignment | undefined
    if (!onMsgProp) return {}

    const lit = onMsgProp.initializer
    if (!ts.isObjectLiteralExpression(lit)) return {}

    for (const chanProp of lit.properties) {
        // only handle normal or shorthand assignments
        if (
            !ts.isPropertyAssignment(chanProp) &&
            !ts.isShorthandPropertyAssignment(chanProp)
        ) continue

        const channel = chanProp.name.getText()
        routes[channel] = {}

        // extract the nested object literal
        const nested = ts.isPropertyAssignment(chanProp)
            ? chanProp.initializer
            : null
        if (!nested || !ts.isObjectLiteralExpression(nested)) continue

        for (const routeProp of nested.properties) {
            // again, only prop- or shorthand-assignments
            if (
                !ts.isPropertyAssignment(routeProp) &&
                !ts.isShorthandPropertyAssignment(routeProp)
            ) continue

            const route = routeProp.name.getText()
            let initializer: ts.Expression

            if (ts.isPropertyAssignment(routeProp)) {
                initializer = routeProp.initializer
            } else {
                // shorthand: { unsubscribe }
                initializer = routeProp.name
            }

            // now pull the handler name off the right‐hand side:
            let handlerName: string | null = null

            if (ts.isIdentifier(initializer)) {
                // unsubscribe or emitMessage
                handlerName = initializer.text
            } else if (ts.isCallExpression(initializer)) {
                // pikkuFunc(...) or shorthand createFunction
                handlerName = extractFunctionName(initializer)
                // assume `initializer` here is already narrowed to ObjectLiteralExpression
            } else if (ts.isObjectLiteralExpression(initializer)) {
                // find the `func` property inside your `{ func: ..., auth: ... }` object
                const fnProp = initializer.properties.find(
                    (p): p is ts.PropertyAssignment =>
                        ts.isPropertyAssignment(p) &&
                        (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
                        p.name.getText() === 'func'
                )

                if (fnProp) {
                    // now TypeScript knows `fnProp` is a PropertyAssignment, so `.initializer` exists
                    const rhs = fnProp.initializer

                    if (ts.isIdentifier(rhs)) {
                        handlerName = rhs.text
                    } else if (ts.isCallExpression(rhs)) {
                        handlerName = extractFunctionName(rhs)
                    } else {
                        console.error(
                            `• Unexpected form for 'func' property in onMessageRoute:`,
                            rhs.kind
                        )
                    }
                }
            }

            if (!handlerName) {
                console.error(`Could not resolve handler for route '${route}'`)
                continue
            }

            const fnMeta = state.functions.meta.find(m => m.name === handlerName)
            if (!fnMeta) {
                console.error(`• No function metadata found for handler '${handlerName}'`)
                continue
            }

            routes[channel][route] = {
                inputs: fnMeta.inputs || null,
                outputs: fnMeta.outputs || null
            }
        }
    }

    return routes
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

        const onMessageRoute = getPropertyAssignment(obj, 'onMessageRoute', false)
        let message: any | null = null
        if (onMessageRoute) {
            const funcName = extractFunctionName(onMessageRoute)
            const fnMeta = state.functions.meta.find(m => m.name === 'funcName')
            if (!fnMeta) {
                console.error(`• No function metadata found for '${funcName}'.`)
            } else {
                message = {
                    inputs: fnMeta.inputs,
                    outputs: fnMeta.outputs,
                }
            }
        }

        const messageRoutes = addMessagesRoutes(
            obj,
            state
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
