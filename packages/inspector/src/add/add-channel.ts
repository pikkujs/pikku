import * as ts from 'typescript'
import { ErrorCode } from '../error-codes.js'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { pathToRegexp } from 'path-to-regexp'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import type { ChannelMessageMeta, ChannelMeta } from '@pikku/core/channel'
import type { InspectorState, AddWiring } from '../types.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { extractWireNames } from '../utils/post-process.js'

/**
 * Safely get the "initializer" expression of a property-like AST node:
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
function getHandlerNameFromExpression(
  expr: ts.Expression,
  checker: ts.TypeChecker,
  rootDir: string
): string | null {
  // Handle direct identifier case (which includes shorthand properties)
  if (ts.isIdentifier(expr)) {
    const sym = checker.getSymbolAtLocation(expr)
    if (sym) {
      let resolvedSym = sym
      if (resolvedSym.flags & ts.SymbolFlags.Alias) {
        resolvedSym = checker.getAliasedSymbol(resolvedSym) ?? resolvedSym
      }

      // Try to get declarations
      const decls = resolvedSym.declarations ?? []
      if (decls.length > 0) {
        const decl = decls[0]!

        // For variable declarations, look at the initializer
        if (ts.isVariableDeclaration(decl) && decl.initializer) {
          if (
            ts.isCallExpression(decl.initializer) ||
            ts.isArrowFunction(decl.initializer) ||
            ts.isFunctionExpression(decl.initializer)
          ) {
            // Extract function name from the declaration's initializer
            const { pikkuFuncName } = extractFunctionName(
              decl.initializer,
              checker,
              rootDir
            )
            return pikkuFuncName
          }
        }
        // For function declarations, use directly
        else if (ts.isFunctionDeclaration(decl)) {
          const { pikkuFuncName } = extractFunctionName(decl, checker, rootDir)
          return pikkuFuncName
        }
      }
    }

    // Fallback: try to extract directly from the identifier
    const { pikkuFuncName } = extractFunctionName(expr, checker, rootDir)
    return pikkuFuncName
  }

  // Handle call expressions
  if (ts.isCallExpression(expr)) {
    const { pikkuFuncName } = extractFunctionName(expr, checker, rootDir)
    return pikkuFuncName
  }

  // Handle object literals with 'func' property
  if (ts.isObjectLiteralExpression(expr)) {
    const fnProp = getPropertyAssignmentInitializer(expr, 'func', true, checker)
    if (fnProp) {
      return getHandlerNameFromExpression(fnProp, checker, rootDir)
    }
  }

  return null
}

/**
 * Build out the nested message-routes by looking up each handler
 * in state.functions.meta instead of re-inferring it here.
 */
export function addMessagesRoutes(
  logger: {
    error: (msg: string) => void
    critical: (code: ErrorCode, msg: string) => void
  },
  obj: ts.ObjectLiteralExpression,
  state: InspectorState,
  checker: ts.TypeChecker
): ChannelMeta['messageWirings'] {
  const result: ChannelMeta['messageWirings'] = {}
  const onMsgRouteProp = getPropertyAssignmentInitializer(
    obj,
    'onMessageWiring',
    true,
    checker
  )
  if (!onMsgRouteProp) return result

  if (!onMsgRouteProp || !ts.isObjectLiteralExpression(onMsgRouteProp))
    return result

  for (const chanElem of onMsgRouteProp.properties) {
    const chanInit = getInitializerOf(chanElem)
    if (!chanInit || !ts.isObjectLiteralExpression(chanInit)) continue

    const channelKey = chanElem.name!.getText()
    result[channelKey] = {}

    for (const routeElem of chanInit.properties) {
      const init = getInitializerOf(routeElem)
      if (!init) continue

      // Get the route key, stripping quotes if it's a string literal
      const routeName = routeElem.name
      if (!routeName) continue

      let routeKey = routeName.getText()
      // For string literals like 'greet' or "greet", strip the quotes
      if (ts.isStringLiteral(routeName)) {
        routeKey = routeName.text
      }

      // For shorthand properties, we need to resolve the identifier to its declaration
      if (ts.isShorthandPropertyAssignment(routeElem)) {
        // Get the symbol for the shorthand property
        const shorthandSym =
          checker.getShorthandAssignmentValueSymbol(routeElem)

        if (
          shorthandSym &&
          shorthandSym.declarations &&
          shorthandSym.declarations.length > 0
        ) {
          const shorthandDecl = shorthandSym.declarations[0]
          if (!shorthandDecl) {
            throw new Error(
              `No declaration found for shorthand property '${routeKey}'`
            )
          }

          // Handle import specifiers
          if (ts.isImportSpecifier(shorthandDecl)) {
            // Get the imported symbol
            const importedSymbol = checker.getSymbolAtLocation(
              shorthandDecl.name
            )
            if (importedSymbol) {
              // Try to resolve the alias to get the original symbol
              let resolvedSymbol = importedSymbol
              if (resolvedSymbol.flags & ts.SymbolFlags.Alias) {
                resolvedSymbol =
                  checker.getAliasedSymbol(resolvedSymbol) ?? resolvedSymbol
              }

              // Try to get the declarations of the resolved symbol
              const importDecls = resolvedSymbol.declarations ?? []
              if (importDecls.length > 0) {
                const importDecl = importDecls[0]!

                // Handle different kinds of declarations
                if (
                  ts.isVariableDeclaration(importDecl) &&
                  importDecl.initializer
                ) {
                  // Extract from the initializer if it's a function
                  if (
                    ts.isArrowFunction(importDecl.initializer) ||
                    ts.isFunctionExpression(importDecl.initializer) ||
                    ts.isCallExpression(importDecl.initializer)
                  ) {
                    const { pikkuFuncName } = extractFunctionName(
                      importDecl.initializer,
                      checker,
                      state.rootDir
                    )
                    const handlerName = pikkuFuncName

                    // Look up in the registry
                    const fnMeta = state.functions.meta[handlerName]
                    if (fnMeta) {
                      // Resolve middleware for this route
                      const routeTags = ts.isObjectLiteralExpression(init)
                        ? getCommonWireMetaData(
                            init,
                            'Channel message',
                            routeKey,
                            logger
                          ).tags
                        : undefined
                      const routeMiddleware = ts.isObjectLiteralExpression(init)
                        ? resolveMiddleware(state, init, routeTags, checker)
                        : undefined

                      result[channelKey]![routeKey] = {
                        pikkuFuncName: handlerName,
                        middleware: routeMiddleware,
                      }
                      continue
                    }
                  }
                } else if (ts.isFunctionDeclaration(importDecl)) {
                  // Extract from the function declaration
                  const { pikkuFuncName } = extractFunctionName(
                    importDecl,
                    checker,
                    state.rootDir
                  )
                  const handlerName = pikkuFuncName

                  // Look up in the registry
                  const fnMeta = state.functions.meta[handlerName]
                  if (fnMeta) {
                    // Resolve middleware for this route
                    const routeTags = ts.isObjectLiteralExpression(init)
                      ? getCommonWireMetaData(
                          init,
                          'Channel message',
                          routeKey,
                          logger
                        ).tags
                      : undefined
                    const routeMiddleware = ts.isObjectLiteralExpression(init)
                      ? resolveMiddleware(state, init, routeTags, checker)
                      : undefined

                    result[channelKey]![routeKey] = {
                      pikkuFuncName: handlerName,
                      middleware: routeMiddleware,
                    }
                    continue
                  }
                } else if (ts.isExportSpecifier(importDecl)) {
                  // For re-exports, we need to follow another level of indirection
                  const exportSymbol = checker.getSymbolAtLocation(
                    importDecl.name
                  )
                  if (exportSymbol) {
                    let resolvedExportSymbol = exportSymbol
                    if (resolvedExportSymbol.flags & ts.SymbolFlags.Alias) {
                      resolvedExportSymbol =
                        checker.getAliasedSymbol(resolvedExportSymbol) ??
                        resolvedExportSymbol
                    }

                    const exportDecls = resolvedExportSymbol.declarations ?? []
                    if (exportDecls.length > 0) {
                      const exportDecl = exportDecls[0]!

                      if (
                        ts.isVariableDeclaration(exportDecl) &&
                        exportDecl.initializer
                      ) {
                        const { pikkuFuncName } = extractFunctionName(
                          exportDecl.initializer,
                          checker,
                          state.rootDir
                        )
                        const handlerName = pikkuFuncName

                        const fnMeta = state.functions.meta[handlerName]
                        if (fnMeta) {
                          // Resolve middleware for this route
                          const routeTags = ts.isObjectLiteralExpression(init)
                            ? getCommonWireMetaData(
                                init,
                                'Channel message',
                                routeKey,
                                logger
                              ).tags
                            : undefined
                          const routeMiddleware = ts.isObjectLiteralExpression(
                            init
                          )
                            ? resolveMiddleware(state, init, routeTags, checker)
                            : undefined

                          result[channelKey]![routeKey] = {
                            pikkuFuncName: handlerName,
                            middleware: routeMiddleware,
                          }
                          continue
                        }
                      } else if (ts.isFunctionDeclaration(exportDecl)) {
                        const { pikkuFuncName } = extractFunctionName(
                          exportDecl,
                          checker,
                          state.rootDir
                        )
                        const handlerName = pikkuFuncName

                        const fnMeta = state.functions.meta[handlerName]
                        if (fnMeta) {
                          // Resolve middleware for this route
                          const routeTags = ts.isObjectLiteralExpression(init)
                            ? getCommonWireMetaData(
                                init,
                                'Channel message',
                                routeKey,
                                logger
                              ).tags
                            : undefined
                          const routeMiddleware = ts.isObjectLiteralExpression(
                            init
                          )
                            ? resolveMiddleware(state, init, routeTags, checker)
                            : undefined

                          result[channelKey]![routeKey] = {
                            pikkuFuncName: handlerName,
                            middleware: routeMiddleware,
                          }
                          continue
                        }
                      }
                    }
                  }
                }
              }
            }

            // As a fallback, try to look up by name
            const funcName = shorthandDecl.name.getText()

            // Look for any function in the registry that ends with this name
            const possibleMatch = Object.keys(state.functions.meta).find(
              (key) => {
                const parts = key.split('_')
                const filename = parts[parts.length - 3] || ''
                return filename.endsWith(funcName)
              }
            )

            if (possibleMatch) {
              const fnMeta = state.functions.meta[possibleMatch]
              if (!fnMeta) {
                logger.critical(
                  ErrorCode.FUNCTION_METADATA_NOT_FOUND,
                  `No function metadata found for handler '${possibleMatch}'`
                )
                continue
              }
              result[channelKey]![routeKey] = {
                pikkuFuncName: possibleMatch,
              }
              continue
            }
          } else {
            // Handle other declaration types (variable, function, etc.)
            let actualFunction: ts.Node | undefined = undefined

            if (ts.isVariableDeclaration(shorthandDecl)) {
              // Check if it has an initializer
              if (shorthandDecl.initializer) {
                // If it's a function expression or similar, use that
                if (
                  ts.isArrowFunction(shorthandDecl.initializer) ||
                  ts.isFunctionExpression(shorthandDecl.initializer) ||
                  ts.isCallExpression(shorthandDecl.initializer)
                ) {
                  actualFunction = shorthandDecl.initializer
                }
              }
            } else if (ts.isFunctionDeclaration(shorthandDecl)) {
              actualFunction = shorthandDecl
            }

            // If we found the actual function, extract its name
            if (actualFunction) {
              // Extract the function name directly from the actual function
              const { pikkuFuncName } = extractFunctionName(
                actualFunction,
                checker,
                state.rootDir
              )
              const handlerName = pikkuFuncName

              // Now use this handlerName to look up in the registry
              const fnMeta = state.functions.meta[handlerName]

              if (fnMeta) {
                // Resolve middleware for this route
                const routeTags = ts.isObjectLiteralExpression(init)
                  ? getCommonWireMetaData(
                      init,
                      'Channel message',
                      routeKey,
                      logger
                    ).tags
                  : undefined
                const routeMiddleware = ts.isObjectLiteralExpression(init)
                  ? resolveMiddleware(state, init, routeTags, checker)
                  : undefined

                result[channelKey]![routeKey] = {
                  pikkuFuncName: handlerName,
                  middleware: routeMiddleware,
                }
                continue // Skip the normal processing below
              }
            }
          }
        }
      }

      // Normal processing for non-shorthand properties
      const handlerName = getHandlerNameFromExpression(
        init,
        checker,
        state.rootDir
      )
      if (!handlerName) {
        logger.error(
          `Could not resolve handler for message route '${routeKey}'`
        )
        continue
      }

      const fnMeta = state.functions.meta[handlerName]
      if (!fnMeta) {
        logger.critical(
          ErrorCode.FUNCTION_METADATA_NOT_FOUND,
          `No function metadata found for handler '${handlerName}'`
        )
        continue
      }

      // Resolve middleware and permissions for this route
      // Check if the route config is an object literal with middleware/permissions
      const routeTags = ts.isObjectLiteralExpression(init)
        ? getCommonWireMetaData(init, 'Channel message', routeKey, logger).tags
        : undefined
      const routeMiddleware = ts.isObjectLiteralExpression(init)
        ? resolveMiddleware(state, init, routeTags, checker)
        : undefined

      result[channelKey]![routeKey] = {
        pikkuFuncName: handlerName,
        middleware: routeMiddleware,
      }
    }
  }

  return result
}

/**
 * Inspect addChannel calls, look up all handlers in state.functions.meta,
 * and emit one entry into state.channels.meta.
 */
export const addChannel: AddWiring = (
  logger,
  node,
  checker,
  state,
  options
) => {
  if (!ts.isCallExpression(node)) return
  const { expression, arguments: args } = node
  if (!ts.isIdentifier(expression) || expression.text !== 'wireChannel') return
  const first = args[0]
  if (!first || !ts.isObjectLiteralExpression(first)) return

  const obj = first
  const name = getPropertyValue(obj, 'name') as string | undefined
  const route = (getPropertyValue(obj, 'route') as string) ?? ''

  if (!name) {
    logger.critical(ErrorCode.MISSING_CHANNEL_NAME, 'Channel name is required')
    return
  }

  // path parameters
  const params = route
    ? pathToRegexp(route)
        .keys.filter((k) => k.type === 'param')
        .map((k) => k.name)
    : []

  const { disabled, tags, summary, description, errors } =
    getCommonWireMetaData(obj, 'Channel', name, logger)

  if (disabled) return

  const query = getPropertyValue(obj, 'query') as string[] | []

  const connect = getPropertyAssignmentInitializer(
    obj,
    'onConnect',
    true,
    checker
  )
  const disconnect = getPropertyAssignmentInitializer(
    obj,
    'onDisconnect',
    true,
    checker
  )

  // default onMessage handler
  let message: ChannelMessageMeta | null = null
  const onMsgProp = getPropertyAssignmentInitializer(
    obj,
    'onMessage',
    true,
    checker
  )

  if (onMsgProp) {
    const { pikkuFuncName } = extractFunctionName(
      onMsgProp,
      checker,
      state.rootDir
    )
    const fnMeta = state.functions.meta[pikkuFuncName]
    if (!fnMeta) {
      logger.critical(
        ErrorCode.FUNCTION_METADATA_NOT_FOUND,
        `No function metadata found for onMessage handler '${pikkuFuncName}'`
      )
      return
    }
    message = {
      pikkuFuncName,
    }
  }

  // nested message-routes
  const messageWirings = addMessagesRoutes(logger, obj, state, checker)

  // --- resolve middleware ---
  const middleware = resolveMiddleware(state, obj, tags, checker)

  // --- track used functions/middleware for service aggregation ---
  // Track connect/disconnect/message handlers
  if (connect) {
    const connectFuncName = extractFunctionName(
      connect,
      checker,
      state.rootDir
    ).pikkuFuncName
    state.serviceAggregation.usedFunctions.add(connectFuncName)
  }
  if (disconnect) {
    const disconnectFuncName = extractFunctionName(
      disconnect as any,
      checker,
      state.rootDir
    ).pikkuFuncName
    state.serviceAggregation.usedFunctions.add(disconnectFuncName)
  }
  if (message) {
    state.serviceAggregation.usedFunctions.add(message.pikkuFuncName)
  }
  // Track message wiring handlers
  for (const channelHandlers of Object.values(messageWirings)) {
    for (const handler of Object.values(channelHandlers)) {
      state.serviceAggregation.usedFunctions.add(handler.pikkuFuncName)
    }
  }
  // Track middleware
  extractWireNames(middleware).forEach((name) =>
    state.serviceAggregation.usedMiddleware.add(name)
  )

  // record into state
  state.channels.files.add(node.getSourceFile().fileName)
  state.channels.meta[name] = {
    name,
    route,
    input: null,
    params: params.length ? params : undefined,
    query: query?.length ? query : undefined,
    // inputTypes: getInputTypes(
    //   state.channels.metaInputTypes,
    //   'get',
    //   null, // TODO
    //   query,
    //   params
    // ),
    connect: connect
      ? {
          pikkuFuncName: extractFunctionName(connect, checker, state.rootDir)
            .pikkuFuncName,
        }
      : null,
    disconnect: disconnect
      ? {
          pikkuFuncName: extractFunctionName(
            disconnect as any,
            checker,
            state.rootDir
          ).pikkuFuncName,
        }
      : null,
    message,
    messageWirings,
    summary,
    description,
    errors,
    tags: tags ?? undefined,
    middleware,
  }
}
