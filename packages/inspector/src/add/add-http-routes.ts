import * as ts from 'typescript'
import { getPropertyValue } from '../utils/get-property-value.js'
import { AddWiring, InspectorState, InspectorLogger } from '../types.js'
import { registerHTTPRoute } from './add-http-route.js'
import { resolveIdentifier } from '../utils/resolve-identifier.js'

/**
 * Group configuration extracted from wireHTTPRoutes or defineHTTPRoutes
 */
interface GroupConfig {
  basePath: string
  tags: string[]
  auth?: boolean
}

/**
 * Process wireHTTPRoutes calls
 */
export const addHTTPRoutes: AddWiring = (
  logger,
  node,
  checker,
  state,
  _options
) => {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node
  if (!ts.isIdentifier(expression) || expression.text !== 'wireHTTPRoutes')
    return

  const firstArg = args[0]
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return

  // Extract group config
  const groupConfig = extractGroupConfig(firstArg)

  // Get routes property
  const routesProp = getPropertyAssignment(firstArg, 'routes')
  if (!routesProp) return

  // Process routes recursively
  processRoutes(
    routesProp.initializer,
    groupConfig,
    state,
    checker,
    logger,
    node.getSourceFile()
  )
}

/**
 * Get a property assignment from an object literal
 */
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

/**
 * Extract group configuration from an object literal
 */
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

/**
 * Merge two group configs following cascading rules
 */
function mergeConfigs(parent: GroupConfig, child: GroupConfig): GroupConfig {
  return {
    basePath: parent.basePath + child.basePath,
    tags: [...parent.tags, ...child.tags],
    auth: child.auth ?? parent.auth,
  }
}

/**
 * Check if a value is a route config (has method, func, and route)
 */
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

/**
 * Check if a value is a route contract (has routes property but no method/func)
 */
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

/**
 * Recursively process routes - handles nested maps, contracts, and identifiers
 */
function processRoutes(
  node: ts.Node,
  parentConfig: GroupConfig,
  state: InspectorState,
  checker: ts.TypeChecker,
  logger: InspectorLogger,
  sourceFile: ts.SourceFile
): void {
  // Handle array of routes
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      if (ts.isObjectLiteralExpression(element) && isRouteConfig(element)) {
        processRoute(element, parentConfig, state, checker, logger, sourceFile)
      }
    }
    return
  }

  // Handle object literal
  if (ts.isObjectLiteralExpression(node)) {
    // Check if this is a route config
    if (isRouteConfig(node)) {
      processRoute(node, parentConfig, state, checker, logger, sourceFile)
      return
    }

    // Check if this is a route contract
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

    // Otherwise it's a nested map - process each property
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
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

  // Handle identifier - resolve to its definition
  if (ts.isIdentifier(node)) {
    const resolved = resolveIdentifier(node, checker, ['defineHTTPRoutes'])
    if (resolved) {
      processRoutes(resolved, parentConfig, state, checker, logger, sourceFile)
    }
  }
}

/**
 * Register a single route using the shared registerHTTPRoute function
 */
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
  })
}
