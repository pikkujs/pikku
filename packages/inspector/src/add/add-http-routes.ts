import * as ts from 'typescript'
import { getPropertyValue } from '../utils/get-property-value.js'
import type {
  AddWiring,
  ExportedHTTPRouteConfigMeta,
  ExportedHTTPRouteMapMeta,
  ExportedHTTPRoutesGroupMeta,
  InspectorLogger,
  InspectorState,
} from '../types.js'
import { registerHTTPRoute, registerHTTPRouteMeta } from './add-http-route.js'
import { resolveIdentifier } from '../utils/resolve-identifier.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { resolveAddonName } from '../utils/resolve-addon-package.js'
import {
  resolveRefContract,
  type RefContractResolution,
} from '../utils/resolve-ref-contract.js'
import { getExportedVariableName } from '../utils/get-exported-variable-name.js'

interface GroupConfig {
  basePath: string
  tags: string[]
  auth?: boolean
}

export const addHTTPRoutes: AddWiring = (
  logger,
  node,
  checker,
  state,
  options
) => {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node
  if (!ts.isIdentifier(expression)) return

  if (expression.text === 'defineHTTPRoutes') {
    const exportName = getExportedVariableName(node, options.sourceFile)
    const firstArg = args[0]
    if (exportName && firstArg && ts.isObjectLiteralExpression(firstArg)) {
      const contract = serializeHTTPRoutesContract(firstArg, checker, state)
      if (contract) {
        state.exportedContracts.http[exportName] = contract
      }
    }
    return
  }

  if (expression.text !== 'wireHTTPRoutes') return

  const firstArg = args[0]
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return

  const groupConfig = extractGroupConfig(firstArg)
  const routesProp = getPropertyAssignment(firstArg, 'routes')
  if (!routesProp) return

  processRoutes(
    routesProp.initializer,
    groupConfig,
    state,
    checker,
    logger,
    node.getSourceFile()
  )
}

function getPropertyAssignment(
  obj: ts.ObjectLiteralExpression,
  propName: string
): ts.PropertyAssignment | undefined {
  for (const prop of obj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propName
    ) {
      return prop
    }
  }
  return undefined
}

function extractGroupConfig(obj: ts.ObjectLiteralExpression): GroupConfig {
  const basePath = (getPropertyValue(obj, 'basePath') as string) || ''
  const tags = (getPropertyValue(obj, 'tags') as string[]) || []
  const auth = getPropertyValue(obj, 'auth')

  return {
    basePath,
    tags,
    auth: auth === true ? true : auth === false ? false : undefined,
  }
}

function mergeConfigs(parent: GroupConfig, child: GroupConfig): GroupConfig {
  return {
    basePath: parent.basePath + child.basePath,
    tags: [...parent.tags, ...child.tags],
    auth: child.auth ?? parent.auth,
  }
}

function isRouteConfig(obj: ts.ObjectLiteralExpression): boolean {
  let hasMethod = false
  let hasFunc = false
  let hasRoute = false

  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      if (prop.name.text === 'method') hasMethod = true
      if (prop.name.text === 'func') hasFunc = true
      if (prop.name.text === 'route') hasRoute = true
    }
  }

  return hasMethod && hasFunc && hasRoute
}

function isRouteContract(obj: ts.ObjectLiteralExpression): boolean {
  let hasRoutes = false
  let hasMethod = false
  let hasFunc = false

  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      if (prop.name.text === 'routes') hasRoutes = true
      if (prop.name.text === 'method') hasMethod = true
      if (prop.name.text === 'func') hasFunc = true
    }
  }

  return hasRoutes && !hasMethod && !hasFunc
}

function processRoutes(
  node: ts.Node,
  parentConfig: GroupConfig,
  state: InspectorState,
  checker: ts.TypeChecker,
  logger: InspectorLogger,
  sourceFile: ts.SourceFile
): void {
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      if (ts.isObjectLiteralExpression(element) && isRouteConfig(element)) {
        processRoute(element, parentConfig, state, checker, logger, sourceFile)
      }
    }
    return
  }

  if (ts.isObjectLiteralExpression(node)) {
    if (isRouteConfig(node)) {
      processRoute(node, parentConfig, state, checker, logger, sourceFile)
      return
    }

    if (isRouteContract(node)) {
      const contractConfig = extractGroupConfig(node)
      const mergedConfig = mergeConfigs(parentConfig, contractConfig)
      const routesProp = getPropertyAssignment(node, 'routes')
      if (routesProp) {
        processRoutes(
          routesProp.initializer,
          mergedConfig,
          state,
          checker,
          logger,
          sourceFile
        )
      }
      return
    }

    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const ref = resolveRefContract(
          prop.initializer,
          'refHTTP',
          state.exportedContracts.addonHttp
        )
        if (ref) {
          processRefHTTPContract(ref, parentConfig, state, logger, sourceFile)
          continue
        }
        processRoutes(
          prop.initializer,
          parentConfig,
          state,
          checker,
          logger,
          sourceFile
        )
      }
    }
    return
  }

  if (ts.isCallExpression(node)) {
    const ref = resolveRefContract(
      node,
      'refHTTP',
      state.exportedContracts.addonHttp
    )
    if (ref) {
      processRefHTTPContract(ref, parentConfig, state, logger, sourceFile)
    }
    return
  }

  if (ts.isIdentifier(node)) {
    const resolved = resolveIdentifier(node, checker, ['defineHTTPRoutes'])
    if (resolved) {
      processRoutes(resolved, parentConfig, state, checker, logger, sourceFile)
    }
  }
}

function processRefHTTPContract(
  ref: RefContractResolution<ExportedHTTPRoutesGroupMeta>,
  parentConfig: GroupConfig,
  state: InspectorState,
  logger: InspectorLogger,
  sourceFile: ts.SourceFile
): void {
  const basePath =
    ref.basePath !== undefined ? ref.basePath : ref.contract.basePath || ''
  processExportedRouteMap(
    ref.contract.routes,
    mergeConfigs(parentConfig, {
      basePath,
      tags: ref.contract.tags || [],
      auth: ref.contract.auth,
    }),
    state,
    logger,
    sourceFile
  )
}

function processExportedRouteMap(
  routes: ExportedHTTPRouteMapMeta,
  parentConfig: GroupConfig,
  state: InspectorState,
  logger: InspectorLogger,
  sourceFile: ts.SourceFile
): void {
  for (const value of Object.values(routes)) {
    if (isExportedRouteConfig(value)) {
      registerHTTPRouteMeta({
        route: value,
        state,
        logger,
        sourceFile,
        basePath: parentConfig.basePath,
        inheritedTags: parentConfig.tags,
        inheritedAuth: parentConfig.auth,
      })
      continue
    }

    if (isExportedRouteContract(value)) {
      processExportedRouteMap(
        value.routes,
        mergeConfigs(parentConfig, {
          basePath: value.basePath || '',
          tags: value.tags || [],
          auth: value.auth,
        }),
        state,
        logger,
        sourceFile
      )
      continue
    }

    processExportedRouteMap(value, parentConfig, state, logger, sourceFile)
  }
}

function isExportedRouteConfig(
  value: ExportedHTTPRouteMapMeta[string]
): value is ExportedHTTPRouteConfigMeta {
  return (
    typeof value === 'object' &&
    value !== null &&
    'method' in value &&
    'route' in value &&
    'func' in value
  )
}

function isExportedRouteContract(
  value: ExportedHTTPRouteMapMeta[string]
): value is ExportedHTTPRoutesGroupMeta {
  return (
    typeof value === 'object' &&
    value !== null &&
    'routes' in value &&
    !('method' in value)
  )
}

function serializeHTTPRoutesContract(
  node: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
  state: InspectorState
): ExportedHTTPRoutesGroupMeta | null {
  if (isRouteContract(node)) {
    const routesProp = getPropertyAssignment(node, 'routes')
    if (!routesProp || !ts.isObjectLiteralExpression(routesProp.initializer)) {
      return null
    }

    return {
      ...extractGroupConfig(node),
      routes: serializeHTTPRouteMap(routesProp.initializer, checker, state),
    }
  }

  return {
    routes: serializeHTTPRouteMap(node, checker, state),
  }
}

function serializeHTTPRouteMap(
  node: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
  state: InspectorState
): ExportedHTTPRouteMapMeta {
  const result: ExportedHTTPRouteMapMeta = {}

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue

    const key = prop.name.getText().replace(/^['"]|['"]$/g, '')
    const value = prop.initializer

    if (ts.isObjectLiteralExpression(value)) {
      if (isRouteConfig(value)) {
        const route = serializeHTTPRouteConfig(value, checker, state)
        if (route) {
          result[key] = route
        }
        continue
      }

      if (isRouteContract(value)) {
        const routeContract = serializeHTTPRoutesContract(value, checker, state)
        if (routeContract) {
          result[key] = routeContract
        }
        continue
      }

      result[key] = serializeHTTPRouteMap(value, checker, state)
      continue
    }

    if (ts.isIdentifier(value)) {
      const resolved = resolveIdentifier(value, checker, ['defineHTTPRoutes'])
      if (resolved && ts.isObjectLiteralExpression(resolved)) {
        if (isRouteContract(resolved)) {
          const routeContract = serializeHTTPRoutesContract(
            resolved,
            checker,
            state
          )
          if (routeContract) {
            result[key] = routeContract
          }
        } else {
          result[key] = serializeHTTPRouteMap(resolved, checker, state)
        }
      }
    }
  }

  return result
}

function serializeHTTPRouteConfig(
  obj: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
  state: InspectorState
): ExportedHTTPRouteConfigMeta | null {
  const method = getPropertyValue(obj, 'method') as string | null
  const route = getPropertyValue(obj, 'route') as string | null
  const funcInitializer = getPropertyAssignmentInitializer(
    obj,
    'func',
    true,
    checker
  )

  if (!method || !route || !funcInitializer) {
    return null
  }

  let pikkuFuncId = extractFunctionName(
    funcInitializer,
    checker,
    state.rootDir
  ).pikkuFuncId
  let packageName: string | undefined

  if (
    ts.isCallExpression(funcInitializer) &&
    ts.isIdentifier(funcInitializer.expression) &&
    funcInitializer.expression.text === 'ref'
  ) {
    const [firstArg] = funcInitializer.arguments
    if (firstArg && ts.isStringLiteral(firstArg)) {
      pikkuFuncId = firstArg.text
      const addonNamespace = pikkuFuncId.includes(':')
        ? pikkuFuncId.split(':')[0]
        : null
      packageName = addonNamespace
        ? state.rpc.wireAddonDeclarations.get(addonNamespace)?.package
        : undefined
    }
  } else if (ts.isIdentifier(funcInitializer)) {
    packageName =
      resolveAddonName(
        funcInitializer,
        checker,
        state.rpc.wireAddonDeclarations
      ) || undefined
  }

  return {
    auth: getPropertyValue(obj, 'auth') as boolean | undefined,
    contentType: getPropertyValue(obj, 'contentType') as string | undefined,
    headers:
      (getPropertyValue(obj, 'headers') as unknown as Record<string, string>) ||
      undefined,
    method,
    route,
    sse: getPropertyValue(obj, 'sse') as boolean | undefined,
    tags: (getPropertyValue(obj, 'tags') as string[]) || undefined,
    timeout: getPropertyValue(obj, 'timeout') as number | undefined,
    func: {
      pikkuFuncId,
      ...(packageName && { packageName }),
    },
  }
}

function processRoute(
  obj: ts.ObjectLiteralExpression,
  groupConfig: GroupConfig,
  state: InspectorState,
  checker: ts.TypeChecker,
  logger: InspectorLogger,
  sourceFile: ts.SourceFile
): void {
  registerHTTPRoute({
    obj,
    state,
    checker,
    logger,
    sourceFile,
    basePath: groupConfig.basePath,
    inheritedTags: groupConfig.tags,
    inheritedAuth: groupConfig.auth,
  })
}
