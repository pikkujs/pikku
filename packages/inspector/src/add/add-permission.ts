import * as ts from 'typescript'
import type { FunctionWiresMeta } from '@pikku/core/function'
import type { AddWiring } from '../types.js'
import { relative } from 'node:path'
import {
  extractFunctionName,
  isNamedExport,
  makeContextBasedId,
} from '../utils/extract-function-name.js'
import {
  extractServicesFromFunction,
  extractUsedWires,
} from '../utils/extract-services.js'
import { getPropertyValue } from '../utils/get-property-value.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import {
  PERMISSION_HELPERS,
  resolveCalleeName,
} from '../utils/resolve-callee-name.js'

function isInsidePermissionContainer(
  node: ts.Node,
  checker: ts.TypeChecker
): boolean {
  let current = node.parent
  while (current) {
    if (
      ts.isCallExpression(current) &&
      resolveCalleeName(current, checker, PERMISSION_HELPERS) ===
        'pikkuPermissionFactory'
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

/**
 * The id of a permission written inline in an `addGlobalPermission([...])`
 * array, which has no variable to be named after. Derived from where it sits,
 * so the registration and the definition agree on it without either having to
 * be visited first.
 */
function inlineGlobalPermissionId(
  node: ts.Node,
  checker: ts.TypeChecker,
  rootDir: string
): string | undefined {
  const array = node.parent
  if (!array || !ts.isArrayLiteralExpression(array)) return undefined
  const call = array.parent
  if (
    !call ||
    !ts.isCallExpression(call) ||
    call.arguments[0] !== array ||
    resolveCalleeName(call, checker, PERMISSION_HELPERS) !==
      'addGlobalPermission'
  ) {
    return undefined
  }
  const sourceFile = node.getSourceFile()
  return makeContextBasedId(
    'global',
    'permission',
    relative(rootDir, sourceFile.fileName),
    String(node.getStart())
  )
}

/**
 * Inspect pikkuPermission, pikkuAuth and pikkuPermissionFactory definitions,
 * and addGlobalPermission registrations.
 */
type PermissionLiteral = ts.ArrayLiteralExpression | ts.ObjectLiteralExpression

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression
  }
  return current
}

/**
 * Follows `addGlobalPermission`'s argument to the array or object literal it was
 * written as: a literal itself, or a `const` (declared here or imported) that is
 * initialised with one. `undefined` when it is built any other way.
 */
const resolvePermissionLiteral = (
  argument: ts.Expression,
  checker: ts.TypeChecker
): PermissionLiteral | undefined => {
  let current = unwrapExpression(argument)
  for (let hops = 0; hops < 8; hops++) {
    if (
      ts.isArrayLiteralExpression(current) ||
      ts.isObjectLiteralExpression(current)
    ) {
      return current
    }
    if (!ts.isIdentifier(current)) return undefined
    let symbol = checker.getSymbolAtLocation(current)
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol)
    }
    const declaration = symbol?.valueDeclaration
    if (
      !declaration ||
      !ts.isVariableDeclaration(declaration) ||
      !declaration.initializer
    ) {
      return undefined
    }
    current = unwrapExpression(declaration.initializer)
  }
  return undefined
}

const isNamedExportedFunction = (
  declaration: ts.FunctionDeclaration,
  checker: ts.TypeChecker
): boolean => {
  if (!declaration.name) return false
  const flags = ts.getCombinedModifierFlags(declaration)
  if (flags & ts.ModifierFlags.Default) return false
  if (flags & ts.ModifierFlags.Export) return true
  const moduleSymbol = checker.getSymbolAtLocation(declaration.getSourceFile())
  const symbol = checker.getSymbolAtLocation(declaration.name)
  return (
    !!moduleSymbol &&
    !!symbol &&
    checker.getExportsOfModule(moduleSymbol).some((exported) => {
      const resolved =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported
      return resolved === symbol
    })
  )
}

const isImmediatelyInvoked = (fn: ts.Node): boolean => {
  let current = fn
  while (current.parent && ts.isParenthesizedExpression(current.parent)) {
    current = current.parent
  }
  return (
    !!current.parent &&
    ts.isCallExpression(current.parent) &&
    current.parent.expression === current
  )
}

type GlobalPermissionActivation =
  | { kind: 'import' }
  | { kind: 'factory'; exportName: string }
  | { kind: 'unreachable' }

/**
 * How the generated permissions file makes this `addGlobalPermission` call run.
 * Importing a file only evaluates its top level, so a call at the top level (or
 * in a function invoked right where it is written) runs on import. A call inside
 * an exported zero-argument function runs when the generated file calls that
 * function. Anywhere else nothing ever calls it, so the gate would not exist.
 */
const globalPermissionActivation = (
  call: ts.CallExpression,
  checker: ts.TypeChecker
): GlobalPermissionActivation => {
  let current: ts.Node = call.parent
  while (current && !ts.isSourceFile(current)) {
    if (
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isConstructorDeclaration(current) ||
      ts.isGetAccessorDeclaration(current) ||
      ts.isSetAccessorDeclaration(current)
    ) {
      if (isImmediatelyInvoked(current)) {
        current = current.parent
        continue
      }
      if (current.parameters.length > 0) return { kind: 'unreachable' }
      if (
        (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
        ts.isVariableDeclaration(current.parent) &&
        ts.isIdentifier(current.parent.name) &&
        isNamedExport(current.parent, checker)
      ) {
        return { kind: 'factory', exportName: current.parent.name.text }
      }
      if (
        ts.isFunctionDeclaration(current) &&
        current.name &&
        isNamedExportedFunction(current, checker)
      ) {
        return { kind: 'factory', exportName: current.name.text }
      }
      return { kind: 'unreachable' }
    }
    current = current.parent
  }
  return { kind: 'import' }
}

export const addPermission: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) return

  const { arguments: args } = node

  const callee = resolveCalleeName(node, checker, PERMISSION_HELPERS)
  if (!callee) return

  // Handle pikkuPermission(...) - individual permission function definition
  if (callee === 'pikkuPermission') {
    // Skip if nested inside pikkuPermissionFactory — the factory handler extracts services itself
    if (isInsidePermissionContainer(node, checker)) return

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
        const globalId = inlineGlobalPermissionId(node, checker, state.rootDir)
        if (!globalId) {
          logger.error(
            `• pikkuPermission() must be assigned to a variable or object property. ` +
              `Extract it to a const: const myPermission = pikkuPermission(...)`
          )
          return
        }
        pikkuFuncId = globalId
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

  if (callee === 'pikkuAuth') {
    if (isInsidePermissionContainer(node, checker)) return

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
        const globalId = inlineGlobalPermissionId(node, checker, state.rootDir)
        if (!globalId) {
          logger.error(
            `• pikkuAuth() must be assigned to a variable or object property. ` +
              `Extract it to a const: const myAuth = pikkuAuth(...)`
          )
          return
        }
        pikkuFuncId = globalId
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
  if (callee === 'pikkuPermissionFactory') {
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
        if (
          resolveCalleeName(node, checker, PERMISSION_HELPERS) ===
          'pikkuPermission'
        ) {
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
  if (callee === 'addGlobalPermission') {
    const permissionsArg = args[0]
    const sourceFile = node.getSourceFile().fileName
    let entries: readonly ts.Expression[] | undefined
    const literal =
      permissionsArg && resolvePermissionLiteral(permissionsArg, checker)
    if (literal && ts.isArrayLiteralExpression(literal)) {
      entries = literal.elements
    } else if (literal) {
      entries = literal.properties.flatMap((p) =>
        ts.isPropertyAssignment(p)
          ? [p.initializer]
          : ts.isShorthandPropertyAssignment(p)
            ? [p.name]
            : []
      )
    }
    if (!entries) {
      logger.warn(
        `• addGlobalPermission(...) in ${sourceFile} is not given an array or object it can follow to a literal, so the services its permissions use cannot be seen.`
      )
    }

    const definitionIds = (entries ?? []).flatMap((entry) => {
      if (ts.isIdentifier(entry)) {
        const { pikkuFuncId } = extractFunctionName(
          entry,
          checker,
          state.rootDir
        )
        return [pikkuFuncId.startsWith('__temp_') ? entry.text : pikkuFuncId]
      }
      if (ts.isCallExpression(entry)) {
        const inline = inlineGlobalPermissionId(entry, checker, state.rootDir)
        if (inline) return [inline]
        if (
          ts.isPropertyAssignment(entry.parent) &&
          ts.isIdentifier(entry.parent.name) &&
          resolveCalleeName(entry, checker, PERMISSION_HELPERS)
        ) {
          return [entry.parent.name.text]
        }
        const { pikkuFuncId } = extractFunctionName(
          entry.expression,
          checker,
          state.rootDir
        )
        return pikkuFuncId.startsWith('__temp_') &&
          ts.isIdentifier(entry.expression)
          ? [entry.expression.text]
          : [pikkuFuncId]
      }
      return []
    })

    const activation = globalPermissionActivation(node, checker)
    if (activation.kind === 'unreachable') {
      logger.warn(
        `• addGlobalPermission(...) in ${sourceFile} sits inside a function that nothing calls: only a call at the top level, or inside an exported function with no parameters, is run by the generated permissions file. This global permission is NOT registered. Export it as \`export const name = () => { addGlobalPermission(...) }\` or move it to the top level.`
      )
      return
    }
    const exportName =
      activation.kind === 'factory' ? activation.exportName : null

    const position = node.getStart()
    if (
      !state.permissions.global.some(
        (g) => g.sourceFile === sourceFile && g.position === position
      )
    ) {
      state.permissions.global.push({
        sourceFile,
        position,
        exportName,
        definitionIds,
      })
    }
    logger.debug(
      `• Found global permissions in ${sourceFile}: [${definitionIds.join(', ')}]`
    )
  }
}
