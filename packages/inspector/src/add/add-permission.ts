import * as ts from 'typescript'
import { AddWiring } from '../types.js'
import {
  extractFunctionName,
  isNamedExport,
} from '../utils/extract-function-name.js'
import { extractServicesFromFunction } from '../utils/extract-services.js'
import { extractPermissionPikkuNames } from '../utils/permissions.js'

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
    const handlerNode = args[0]
    if (!handlerNode) return

    if (
      !ts.isArrowFunction(handlerNode) &&
      !ts.isFunctionExpression(handlerNode)
    ) {
      logger.error(`• Handler for pikkuPermission is not a function.`)
      return
    }

    const services = extractServicesFromFunction(handlerNode)
    const { pikkuFuncName, exportedName } = extractFunctionName(node, checker)
    state.permissions.meta[pikkuFuncName] = {
      services,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      exportedName,
    }

    logger.debug(
      `• Found permission with services: ${services.services.join(', ')}`
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

    // Extract permission pikkuFuncNames from array
    const permissionNames = extractPermissionPikkuNames(
      permissionsArrayArg,
      checker
    )

    if (permissionNames.length === 0) {
      logger.warn(`• addPermission('${tag}', ...) has empty permissions array`)
      return
    }

    // Collect services from all permissions in the group
    const allServices = new Set<string>()
    for (const permissionName of permissionNames) {
      const permissionMeta = state.permissions.meta[permissionName]
      if (permissionMeta && permissionMeta.services) {
        for (const service of permissionMeta.services.services) {
          allServices.add(service)
        }
      }
    }

    // Check if this call is wrapped in a factory function
    // We need to walk up the tree to see if the parent is: const x = () => addPermission(...)
    let isFactory = false
    let exportedName: string | null = null
    let parent = node.parent

    // Check if parent is arrow function: () => addPermission(...)
    if (parent && ts.isArrowFunction(parent)) {
      // Check if arrow function has no parameters
      if (parent.parameters.length === 0) {
        isFactory = true

        // For factories, we need to check the arrow function's parent for the export name
        // const apiTagPermissions = () => addPermission(...)
        const arrowParent = parent.parent
        if (arrowParent && ts.isVariableDeclaration(arrowParent)) {
          if (ts.isIdentifier(arrowParent.name)) {
            // Check if it's exported
            if (isNamedExport(arrowParent)) {
              exportedName = arrowParent.name.text
            }
          }
        }
      }
    }

    // If not a factory, get export name from the call expression itself
    if (!isFactory) {
      const extracted = extractFunctionName(node, checker)
      exportedName = extracted.exportedName
    }

    // Log warning if not using factory pattern
    if (!isFactory && exportedName) {
      logger.warn(
        `• Permission group '${exportedName}' for tag '${tag}' is not wrapped in a factory function. ` +
          `For tree-shaking, use: export const ${exportedName} = () => addPermission('${tag}', [...])`
      )
    }

    // Store group metadata
    state.permissions.tagPermissions.set(tag, {
      exportName: exportedName,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      services: {
        optimized: false,
        services: Array.from(allServices),
      },
      permissionCount: permissionNames.length,
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

    // Extract permission pikkuFuncNames from array
    const permissionNames = extractPermissionPikkuNames(
      permissionsArrayArg,
      checker
    )

    if (permissionNames.length === 0) {
      logger.warn(
        `• addHTTPPermission('${pattern}', ...) has empty permissions array`
      )
      return
    }

    // Collect services from all permissions in the group
    const allServices = new Set<string>()
    for (const permissionName of permissionNames) {
      const permissionMeta = state.permissions.meta[permissionName]
      if (permissionMeta && permissionMeta.services) {
        for (const service of permissionMeta.services.services) {
          allServices.add(service)
        }
      }
    }

    // Check if this call is wrapped in a factory function
    let isFactory = false
    let exportedName: string | null = null
    let parent = node.parent

    // Check if parent is arrow function: () => addHTTPPermission(...)
    if (parent && ts.isArrowFunction(parent)) {
      // Check if arrow function has no parameters
      if (parent.parameters.length === 0) {
        isFactory = true

        // For factories, we need to check the arrow function's parent for the export name
        // const apiRoutePermissions = () => addHTTPPermission(...)
        const arrowParent = parent.parent
        if (arrowParent && ts.isVariableDeclaration(arrowParent)) {
          if (ts.isIdentifier(arrowParent.name)) {
            // Check if it's exported
            if (isNamedExport(arrowParent)) {
              exportedName = arrowParent.name.text
            }
          }
        }
      }
    }

    // If not a factory, get export name from the call expression itself
    if (!isFactory) {
      const extracted = extractFunctionName(node, checker)
      exportedName = extracted.exportedName
    }

    // Log warning if not using factory pattern
    if (!isFactory && exportedName) {
      logger.warn(
        `• HTTP permission group '${exportedName}' for pattern '${pattern}' is not wrapped in a factory function. ` +
          `For tree-shaking, use: export const ${exportedName} = () => addHTTPPermission('${pattern}', [...])`
      )
    }

    // Store group metadata
    state.http.routePermissions.set(pattern, {
      exportName: exportedName,
      sourceFile: node.getSourceFile().fileName,
      position: node.getStart(),
      services: {
        optimized: false,
        services: Array.from(allServices),
      },
      permissionCount: permissionNames.length,
      isFactory,
    })

    logger.debug(
      `• Found HTTP route permission group: ${pattern} -> [${permissionNames.join(', ')}] (${isFactory ? 'factory' : 'direct'})`
    )
    return
  }
}
