import * as ts from 'typescript'
import type { AddWiring, InspectorState } from '../types.js'
import {
  extractFunctionName,
  isNamedExport,
  makeContextBasedId,
} from '../utils/extract-function-name.js'
import { extractServicesFromFunction } from '../utils/extract-services.js'
import { extractMiddlewareRefs } from '../utils/middleware.js'
import { getPropertyValue } from '../utils/get-property-value.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'

function renameTempDefinitions(
  state: InspectorState,
  definitionIds: string[],
  groupType: string,
  groupKey: string
): void {
  const tempIndices = definitionIds
    .map((name, i) => (name.startsWith('__temp_') ? i : -1))
    .filter((i) => i >= 0)

  for (const idx of tempIndices) {
    const oldId = definitionIds[idx]
    const newId =
      tempIndices.length === 1
        ? makeContextBasedId(groupType, groupKey)
        : makeContextBasedId(groupType, groupKey, String(idx))
    const existing = state.middleware.definitions[oldId]
    if (existing) {
      delete state.middleware.definitions[oldId]
      state.middleware.definitions[newId] = existing
    }
    definitionIds[idx] = newId
  }
}

export const addMiddleware: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node

  if (!ts.isIdentifier(expression)) {
    return
  }

  if (expression.text === 'pikkuMiddleware') {
    const arg = args[0]
    if (!arg) return

    let actualHandler: ts.ArrowFunction | ts.FunctionExpression
    let name: string | undefined
    let description: string | undefined

    if (ts.isObjectLiteralExpression(arg)) {
      const nameValue = getPropertyValue(arg, 'name')
      const descValue = getPropertyValue(arg, 'description')
      name = typeof nameValue === 'string' ? nameValue : undefined
      description = typeof descValue === 'string' ? descValue : undefined

      const fnProp = getPropertyAssignmentInitializer(
        arg,
        'func',
        true,
        checker
      )
      if (
        !fnProp ||
        (!ts.isArrowFunction(fnProp) && !ts.isFunctionExpression(fnProp))
      ) {
        logger.error(
          `• pikkuMiddleware object missing required 'func' property.`
        )
        return
      }
      actualHandler = fnProp
    } else if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      actualHandler = arg
    } else {
      logger.error(`• Handler for pikkuMiddleware is not a function.`)
      return
    }

    const services = extractServicesFromFunction(actualHandler)
    let { pikkuFuncId, exportedName } = extractFunctionName(
      node,
      checker,
      state.rootDir
    )
    if (pikkuFuncId.startsWith('__temp_')) {
      if (
        ts.isVariableDeclaration(node.parent) &&
        ts.isIdentifier(node.parent.name)
      ) {
        pikkuFuncId = node.parent.name.text
      } else if (
        ts.isPropertyAssignment(node.parent) &&
        ts.isIdentifier(node.parent.name)
      ) {
        pikkuFuncId = node.parent.name.text
      } else {
        logger.error(
          `• pikkuMiddleware() must be assigned to a variable or object property. ` +
            `Extract it to a const: const myMiddleware = pikkuMiddleware(...)`
        )
        return
      }
    }
    state.middleware.definitions[pikkuFuncId] = {
      services,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      exportedName,
      name,
      description,
    }

    logger.debug(
      `• Found middleware with services: ${services.services.join(', ')}${name ? ` (name: ${name})` : ''}${description ? ` (description: ${description})` : ''}`
    )
    return
  }

  if (expression.text === 'pikkuMiddlewareFactory') {
    const factoryNode = args[0]
    if (!factoryNode) return

    if (
      !ts.isArrowFunction(factoryNode) &&
      !ts.isFunctionExpression(factoryNode)
    ) {
      logger.error(`• Handler for pikkuMiddlewareFactory is not a function.`)
      return
    }

    let services = { optimized: false, services: [] as string[] }

    const findPikkuMiddlewareCall = (
      node: ts.Node
    ): ts.CallExpression | undefined => {
      if (ts.isCallExpression(node)) {
        const expr = node.expression
        if (ts.isIdentifier(expr) && expr.text === 'pikkuMiddleware') {
          return node
        }
      }
      return ts.forEachChild(node, findPikkuMiddlewareCall)
    }

    const pikkuMiddlewareCall = findPikkuMiddlewareCall(factoryNode)
    if (pikkuMiddlewareCall && pikkuMiddlewareCall.arguments[0]) {
      const middlewareHandler = pikkuMiddlewareCall.arguments[0]
      if (
        ts.isArrowFunction(middlewareHandler) ||
        ts.isFunctionExpression(middlewareHandler)
      ) {
        services = extractServicesFromFunction(middlewareHandler)
      }
    } else {
      if (
        ts.isArrowFunction(factoryNode) ||
        ts.isFunctionExpression(factoryNode)
      ) {
        const factoryBody = factoryNode.body
        if (
          ts.isArrowFunction(factoryBody) ||
          ts.isFunctionExpression(factoryBody)
        ) {
          services = extractServicesFromFunction(factoryBody)
        }
      }
    }

    let { pikkuFuncId, exportedName } = extractFunctionName(
      node,
      checker,
      state.rootDir
    )
    if (pikkuFuncId.startsWith('__temp_')) {
      if (
        ts.isVariableDeclaration(node.parent) &&
        ts.isIdentifier(node.parent.name)
      ) {
        pikkuFuncId = node.parent.name.text
      } else if (
        ts.isPropertyAssignment(node.parent) &&
        ts.isIdentifier(node.parent.name)
      ) {
        pikkuFuncId = node.parent.name.text
      } else {
        logger.error(
          `• pikkuMiddlewareFactory() must be assigned to a variable or object property. ` +
            `Extract it to a const: const myMiddleware = pikkuMiddlewareFactory(...)`
        )
        return
      }
    }
    state.middleware.definitions[pikkuFuncId] = {
      services,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      exportedName,
      factory: true,
    }

    logger.debug(
      `• Found middleware factory with services: ${services.services.join(', ')}`
    )
    return
  }

  if (expression.text === 'addMiddleware') {
    const tagArg = args[0]
    const middlewareArrayArg = args[1]

    if (!tagArg || !middlewareArrayArg) return

    let tag: string | undefined
    if (ts.isStringLiteral(tagArg)) {
      tag = tagArg.text
    }

    if (!tag) {
      logger.warn(`• addMiddleware call without valid tag string`)
      return
    }

    if (!ts.isArrayLiteralExpression(middlewareArrayArg)) {
      logger.error(
        `• addMiddleware('${tag}', ...) must have a literal array as second argument`
      )
      return
    }

    const refs = extractMiddlewareRefs(
      middlewareArrayArg,
      checker,
      state.rootDir
    )

    if (refs.length === 0) {
      logger.warn(`• addMiddleware('${tag}', ...) has empty middleware array`)
      return
    }

    const definitionIds = refs.map((r) => r.definitionId)
    renameTempDefinitions(state, definitionIds, 'tag', tag)

    const sourceFile = node.getSourceFile().fileName
    const instanceIds: string[] = []
    for (let i = 0; i < refs.length; i++) {
      const instanceId = makeContextBasedId('tag', tag, String(i))
      state.middleware.instances[instanceId] = {
        definitionId: definitionIds[i],
        sourceFile,
        position: node.getStart(),
        isFactoryCall: refs[i].isFactoryCall,
      }
      instanceIds.push(instanceId)
    }

    const allServices = new Set<string>()
    for (const defId of definitionIds) {
      const def = state.middleware.definitions[defId]
      if (def?.services) {
        for (const service of def.services.services) {
          allServices.add(service)
        }
      }
    }

    let isFactory = false
    let exportedName: string | null = null
    let parent = node.parent

    if (parent && ts.isArrowFunction(parent)) {
      if (parent.parameters.length === 0) {
        isFactory = true

        const arrowParent = parent.parent
        if (arrowParent && ts.isVariableDeclaration(arrowParent)) {
          if (ts.isIdentifier(arrowParent.name)) {
            if (isNamedExport(arrowParent)) {
              exportedName = arrowParent.name.text
            }
          }
        }
      }
    }

    if (!isFactory) {
      const extracted = extractFunctionName(node, checker, state.rootDir)
      exportedName = extracted.exportedName
    }

    if (!isFactory && exportedName) {
      logger.warn(
        `• Middleware group '${exportedName}' for tag '${tag}' is not wrapped in a factory function. ` +
          `For tree-shaking, use: export const ${exportedName} = () => addMiddleware('${tag}', [...])`
      )
    }

    state.middleware.tagMiddleware.set(tag, {
      exportName: exportedName,
      sourceFile,
      position: node.getStart(),
      services: {
        optimized: false,
        services: Array.from(allServices),
      },
      count: refs.length,
      instanceIds,
      isFactory,
    })

    logger.debug(
      `• Found tag middleware group: ${tag} -> [${instanceIds.join(', ')}] (${isFactory ? 'factory' : 'direct'})`
    )
    return
  }

  if (expression.text === 'addHTTPMiddleware') {
    const patternArg = args[0]
    const middlewareArrayArg = args[1]

    if (!patternArg || !middlewareArrayArg) return

    let pattern: string | undefined
    if (ts.isStringLiteral(patternArg)) {
      pattern = patternArg.text
    }

    if (!pattern) {
      logger.warn(`• addHTTPMiddleware call without valid pattern string`)
      return
    }

    if (!ts.isArrayLiteralExpression(middlewareArrayArg)) {
      logger.error(
        `• addHTTPMiddleware('${pattern}', ...) must have a literal array as second argument`
      )
      return
    }

    const refs = extractMiddlewareRefs(
      middlewareArrayArg,
      checker,
      state.rootDir
    )

    if (refs.length === 0) {
      logger.warn(
        `• addHTTPMiddleware('${pattern}', ...) has empty middleware array`
      )
      return
    }

    const definitionIds = refs.map((r) => r.definitionId)
    renameTempDefinitions(state, definitionIds, 'http', pattern)

    const sourceFile = node.getSourceFile().fileName
    const instanceIds: string[] = []
    for (let i = 0; i < refs.length; i++) {
      const instanceId = makeContextBasedId('http', pattern, String(i))
      state.middleware.instances[instanceId] = {
        definitionId: definitionIds[i],
        sourceFile,
        position: node.getStart(),
        isFactoryCall: refs[i].isFactoryCall,
      }
      instanceIds.push(instanceId)
    }

    const allServices = new Set<string>()
    for (const defId of definitionIds) {
      const def = state.middleware.definitions[defId]
      if (def?.services) {
        for (const service of def.services.services) {
          allServices.add(service)
        }
      }
    }

    let isFactory = false
    let exportedName: string | null = null
    let parent = node.parent

    if (parent && ts.isArrowFunction(parent)) {
      if (parent.parameters.length === 0) {
        isFactory = true

        const arrowParent = parent.parent
        if (arrowParent && ts.isVariableDeclaration(arrowParent)) {
          if (ts.isIdentifier(arrowParent.name)) {
            if (isNamedExport(arrowParent)) {
              exportedName = arrowParent.name.text
            }
          }
        }
      }
    }

    if (!isFactory) {
      const extracted = extractFunctionName(node, checker, state.rootDir)
      exportedName = extracted.exportedName
    }

    if (!isFactory && exportedName) {
      logger.warn(
        `• HTTP middleware group '${exportedName}' for pattern '${pattern}' is not wrapped in a factory function. ` +
          `For tree-shaking, use: export const ${exportedName} = () => addHTTPMiddleware('${pattern}', [...])`
      )
    }

    state.http.routeMiddleware.set(pattern, {
      exportName: exportedName,
      sourceFile,
      position: node.getStart(),
      services: {
        optimized: false,
        services: Array.from(allServices),
      },
      count: refs.length,
      instanceIds,
      isFactory,
    })

    logger.debug(
      `• Found HTTP route middleware group: ${pattern} -> [${instanceIds.join(', ')}] (${isFactory ? 'factory' : 'direct'})`
    )
    return
  }
}
