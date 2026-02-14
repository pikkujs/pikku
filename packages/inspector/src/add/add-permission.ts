import * as ts from 'typescript'
import type { AddWiring, InspectorState } from '../types.js'
import {
  extractFunctionName,
  isNamedExport,
  makeContextBasedId,
} from '../utils/extract-function-name.js'
import {
  extractServicesFromFunction,
  extractUsedWires,
} from '../utils/extract-services.js'
import { extractPermissionPikkuNames } from '../utils/permissions.js'
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
    const existing = state.permissions.definitions[oldId]
    if (existing) {
      delete state.permissions.definitions[oldId]
      state.permissions.definitions[newId] = existing
    }
    definitionIds[idx] = newId
  }
}

function isInsidePermissionFactory(node: ts.Node): boolean {
  let current = node.parent
  while (current) {
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === 'pikkuPermissionFactory'
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

/**
 * Inspect pikkuPermission calls, addPermission calls, and addHTTPPermission calls
 */
export const addPermission: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node

  // only handle specific function calls
  if (!ts.isIdentifier(expression)) {
    return
  }

  // Handle pikkuPermission(...) - individual permission function definition
  if (expression.text === 'pikkuPermission') {
    // Skip if nested inside pikkuPermissionFactory — the factory handler extracts services itself
    if (isInsidePermissionFactory(node)) return

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
          `• pikkuPermission object missing required 'func' property.`
        )
        return
      }
      actualHandler = fnProp
    } else if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      actualHandler = arg
    } else {
      logger.error(`• Handler for pikkuPermission is not a function.`)
      return
    }

    const services = extractServicesFromFunction(actualHandler)
    const usedWires = extractUsedWires(actualHandler, 2)
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
          `• pikkuPermission() must be assigned to a variable or object property. ` +
            `Extract it to a const: const myPermission = pikkuPermission(...)`
        )
        return
      }
    }
    state.permissions.definitions[pikkuFuncId] = {
      services,
      usedWires: usedWires.length > 0 ? usedWires : undefined,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      exportedName,
      name,
      description,
    }

    logger.debug(
      `• Found permission with services: ${services.services.join(', ')}${name ? ` (name: ${name})` : ''}${description ? ` (description: ${description})` : ''}`
    )
    return
  }

  // Handle pikkuPermissionFactory(...) - permission factory function
  if (expression.text === 'pikkuPermissionFactory') {
    const factoryNode = args[0]
    if (!factoryNode) return

    if (
      !ts.isArrowFunction(factoryNode) &&
      !ts.isFunctionExpression(factoryNode)
    ) {
      logger.error(`• Handler for pikkuPermissionFactory is not a function.`)
      return
    }

    // Extract services by looking inside the factory function body
    // The factory should return pikkuPermission(...), so we need to find that call
    // If no wrapper is found, extract from the factory's returned function directly
    let services = { optimized: false, services: [] as string[] }
    let usedWires: string[] = []

    const findPikkuPermissionCall = (
      node: ts.Node
    ): ts.CallExpression | undefined => {
      if (ts.isCallExpression(node)) {
        const expr = node.expression
        if (ts.isIdentifier(expr) && expr.text === 'pikkuPermission') {
          return node
        }
      }
      return ts.forEachChild(node, findPikkuPermissionCall)
    }

    const pikkuPermissionCall = findPikkuPermissionCall(factoryNode)
    if (pikkuPermissionCall && pikkuPermissionCall.arguments[0]) {
      const permissionHandler = pikkuPermissionCall.arguments[0]
      if (
        ts.isArrowFunction(permissionHandler) ||
        ts.isFunctionExpression(permissionHandler)
      ) {
        services = extractServicesFromFunction(permissionHandler)
        usedWires = extractUsedWires(permissionHandler, 2)
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
          usedWires = extractUsedWires(factoryBody, 2)
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
          `• pikkuPermissionFactory() must be assigned to a variable or object property. ` +
            `Extract it to a const: const myPermission = pikkuPermissionFactory(...)`
        )
        return
      }
    }
    state.permissions.definitions[pikkuFuncId] = {
      services,
      usedWires: usedWires.length > 0 ? usedWires : undefined,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      exportedName,
      factory: true,
    }

    logger.debug(
      `• Found permission factory with services: ${services.services.join(', ')}`
    )
    return
  }

  // Handle addPermission('tag', [permission1, permission2])
  // Supports two patterns:
  // 1. export const x = () => addPermission('tag', [...])  (factory - tree-shakeable)
  // 2. export const x = addPermission('tag', [...])  (direct - no tree-shaking)
  if (expression.text === 'addPermission') {
    const tagArg = args[0]
    const permissionsArrayArg = args[1]

    if (!tagArg || !permissionsArrayArg) return

    // Extract tag name
    let tag: string | undefined
    if (ts.isStringLiteral(tagArg)) {
      tag = tagArg.text
    }

    if (!tag) {
      logger.warn(`• addPermission call without valid tag string`)
      return
    }

    // Check if permissions is a literal array or object
    if (
      !ts.isArrayLiteralExpression(permissionsArrayArg) &&
      !ts.isObjectLiteralExpression(permissionsArrayArg)
    ) {
      logger.error(
        `• addPermission('${tag}', ...) must have a literal array or object as second argument`
      )
      return
    }

    // Extract permission pikkuFuncIds from array
    const permissionNames = extractPermissionPikkuNames(
      permissionsArrayArg,
      checker,
      state.rootDir
    )

    if (permissionNames.length === 0) {
      logger.warn(`• addPermission('${tag}', ...) has empty permissions array`)
      return
    }

    renameTempDefinitions(state, permissionNames, 'tag', tag)

    const allServices = new Set<string>()
    for (const permissionName of permissionNames) {
      const permissionMeta = state.permissions.definitions[permissionName]
      if (permissionMeta && permissionMeta.services) {
        for (const service of permissionMeta.services.services) {
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
        `• Permission group '${exportedName}' for tag '${tag}' is not wrapped in a factory function. ` +
          `For tree-shaking, use: export const ${exportedName} = () => addPermission('${tag}', [...])`
      )
    }

    state.permissions.tagPermissions.set(tag, {
      exportName: exportedName,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      services: {
        optimized: false,
        services: Array.from(allServices),
      },
      count: permissionNames.length,
      instanceIds: permissionNames,
      isFactory,
    })

    logger.debug(
      `• Found tag permission group: ${tag} -> [${permissionNames.join(', ')}] (${isFactory ? 'factory' : 'direct'})`
    )
    return
  }

  // Handle addHTTPPermission(pattern, [permission1, permission2])
  // Supports two patterns:
  // 1. export const x = () => addHTTPPermission('*', [...])  (factory - tree-shakeable)
  // 2. export const x = addHTTPPermission('*', [...])  (direct - no tree-shaking)
  if (expression.text === 'addHTTPPermission') {
    const patternArg = args[0]
    const permissionsArrayArg = args[1]

    if (!patternArg || !permissionsArrayArg) return

    // Extract route pattern
    let pattern: string | undefined
    if (ts.isStringLiteral(patternArg)) {
      pattern = patternArg.text
    }

    if (!pattern) {
      logger.warn(`• addHTTPPermission call without valid pattern string`)
      return
    }

    // Check if permissions is a literal array or object
    if (
      !ts.isArrayLiteralExpression(permissionsArrayArg) &&
      !ts.isObjectLiteralExpression(permissionsArrayArg)
    ) {
      logger.error(
        `• addHTTPPermission('${pattern}', ...) must have a literal array or object as second argument`
      )
      return
    }

    // Extract permission pikkuFuncIds from array
    const permissionNames = extractPermissionPikkuNames(
      permissionsArrayArg,
      checker,
      state.rootDir
    )

    if (permissionNames.length === 0) {
      logger.warn(
        `• addHTTPPermission('${pattern}', ...) has empty permissions array`
      )
      return
    }

    renameTempDefinitions(state, permissionNames, 'http', pattern)

    const allServices = new Set<string>()
    for (const permissionName of permissionNames) {
      const permissionMeta = state.permissions.definitions[permissionName]
      if (permissionMeta && permissionMeta.services) {
        for (const service of permissionMeta.services.services) {
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
        `• HTTP permission group '${exportedName}' for pattern '${pattern}' is not wrapped in a factory function. ` +
          `For tree-shaking, use: export const ${exportedName} = () => addHTTPPermission('${pattern}', [...])`
      )
    }

    state.http.routePermissions.set(pattern, {
      exportName: exportedName,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      services: {
        optimized: false,
        services: Array.from(allServices),
      },
      count: permissionNames.length,
      instanceIds: permissionNames,
      isFactory,
    })

    logger.debug(
      `• Found HTTP route permission group: ${pattern} -> [${permissionNames.join(', ')}] (${isFactory ? 'factory' : 'direct'})`
    )
    return
  }
}
