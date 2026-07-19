import * as ts from 'typescript'
import type { FunctionWiresMeta } from '@pikku/core'
import type { AddWiring } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import {
  extractServicesFromFunction,
  extractUsedWires,
} from '../utils/extract-services.js'
import { getPropertyValue } from '../utils/get-property-value.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'

function isInsidePermissionContainer(node: ts.Node): boolean {
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
 * Inspect pikkuPermission, pikkuAuth, and pikkuPermissionFactory definitions.
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
    if (isInsidePermissionContainer(node)) return

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
    const wires = extractUsedWires(actualHandler, 2)
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
    const dataParam = actualHandler.parameters[1]
    const dataParamName =
      dataParam && ts.isIdentifier(dataParam.name) ? dataParam.name.text : null
    const requiresData = !(dataParamName && dataParamName.startsWith('_'))

    state.permissions.definitions[pikkuFuncId] = {
      services,
      wires: wires.wires.length > 0 || !wires.optimized ? wires : undefined,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      exportedName,
      name,
      description,
      ...(requiresData ? {} : { requiresData: false }),
    }

    logger.debug(
      `• Found permission with services: ${services.services.join(', ')}${name ? ` (name: ${name})` : ''}${description ? ` (description: ${description})` : ''}${!requiresData ? ' (auth-only)' : ''}`
    )
    return
  }

  if (expression.text === 'pikkuAuth') {
    if (isInsidePermissionContainer(node)) return

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
        logger.error(`• pikkuAuth object missing required 'func' property.`)
        return
      }
      actualHandler = fnProp
    } else if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      actualHandler = arg
    } else {
      logger.error(`• Handler for pikkuAuth is not a function.`)
      return
    }

    const services = extractServicesFromFunction(actualHandler)
    // pikkuAuth's handler is (services, session) — its second parameter is the
    // resolved user session, NOT a wires bag, so it must not be analyzed (or
    // flagged) as a non-destructured wires parameter. pikkuAuth exposes no
    // user-facing wires parameter.
    const wires: FunctionWiresMeta = { optimized: true, wires: [] }
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
          `• pikkuAuth() must be assigned to a variable or object property. ` +
            `Extract it to a const: const myAuth = pikkuAuth(...)`
        )
        return
      }
    }
    state.permissions.definitions[pikkuFuncId] = {
      services,
      wires: wires.wires.length > 0 || !wires.optimized ? wires : undefined,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      exportedName,
      name,
      description,
      requiresData: false,
    }

    logger.debug(
      `• Found auth permission with services: ${services.services.join(', ')}${name ? ` (name: ${name})` : ''}${description ? ` (description: ${description})` : ''}`
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
    let wires: ReturnType<typeof extractUsedWires> = {
      optimized: true,
      wires: [],
    }

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
        wires = extractUsedWires(permissionHandler, 2)
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
          wires = extractUsedWires(factoryBody, 2)
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
      wires: wires.wires.length > 0 || !wires.optimized ? wires : undefined,
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
}
