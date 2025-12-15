import * as ts from 'typescript'
import {
  InspectorState,
  InspectorLogger,
  ExternalPackageConfig,
} from '../types.js'
import {
  FunctionServicesMeta,
  MiddlewareMetadata,
  PermissionMetadata,
} from '@pikku/core'
import { extractTypeKeys } from './type-utils.js'
import {
  extractAllServiceMetadata,
  ServiceMetadata,
} from './extract-service-metadata.js'
import { ErrorCode } from '../error-codes.js'

/**
 * Helper to extract wire-level middleware/permission names from metadata.
 * Only extracts type:'wire' variants (individual middleware/permissions).
 * Skips type:'http' and type:'tag' (reference groups, not individuals).
 */
export function extractWireNames(
  list?: MiddlewareMetadata[] | PermissionMetadata[]
): string[] {
  if (!list) return []
  return list
    .filter(
      (item): item is { type: 'wire'; name: string } => item.type === 'wire'
    )
    .map((item) => item.name)
}

/**
 * Helper to expand middleware/permission groups into individual names
 * and add their services to the aggregation.
 * This handles tag-based and HTTP-pattern-based middleware/permission groups.
 */
function expandAndAddGroupServices(
  list: MiddlewareMetadata[] | PermissionMetadata[] | undefined,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>,
  addServices: (services: FunctionServicesMeta | undefined) => void,
  isMiddleware: boolean
): void {
  if (!list) return

  for (const item of list) {
    if (item.type === 'tag') {
      // Expand tag-based group
      const groupMeta = isMiddleware
        ? state.middleware.tagMiddleware.get(item.tag)
        : state.permissions.tagPermissions.get(item.tag)

      if (groupMeta?.services) {
        addServices(groupMeta.services)
      }
    } else if (item.type === 'http' && 'route' in item) {
      // Expand HTTP-pattern-based group
      const groupMeta = isMiddleware
        ? state.http.routeMiddleware.get(item.route)
        : state.http.routePermissions.get(item.route)

      if (groupMeta?.services) {
        addServices(groupMeta.services)
      }
    }
  }
}

/**
 * Extracts all service names from SingletonServices and Services types.
 * This provides the complete list of available services for code generation.
 * Only runs if typesLookup is available (omitted in deserialized states).
 */
function extractAllServices(
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  // Skip if typesLookup is not available (e.g., deserialized state)
  if (!('typesLookup' in state)) {
    return
  }

  // Extract all singleton services from the SingletonServices type
  const singletonServicesTypes = state.typesLookup.get('SingletonServices')
  if (singletonServicesTypes && singletonServicesTypes.length > 0) {
    const singletonServiceNames = extractTypeKeys(singletonServicesTypes[0])
    state.serviceAggregation.allSingletonServices = singletonServiceNames.sort()
  }

  // Extract all services from the Services type
  const servicesTypes = state.typesLookup.get('Services')
  if (servicesTypes && servicesTypes.length > 0) {
    const allServiceNames = extractTypeKeys(servicesTypes[0])
    // Wire services are those in Services but not in SingletonServices
    const singletonSet = new Set(state.serviceAggregation.allSingletonServices)
    state.serviceAggregation.allWireServices = allServiceNames
      .filter((name) => !singletonSet.has(name))
      .sort()
  }
}

/**
 * Aggregates all required services from wired functions, middleware, and permissions.
 * Must be called after AST traversal completes.
 *
 * Note: usedFunctions, usedMiddleware, and usedPermissions are tracked directly
 * in the add-* methods during AST traversal for efficiency.
 */
export function aggregateRequiredServices(
  state: InspectorState | Omit<InspectorState, 'typesLookup'>
): void {
  // First, extract all available services from types
  extractAllServices(state)

  const { requiredServices, usedFunctions, usedMiddleware, usedPermissions } =
    state.serviceAggregation

  // Internal services (always excluded from tree-shaking)
  const internalServices = new Set(['rpc', 'mcp', 'channel', 'userSession'])

  const addServices = (services: FunctionServicesMeta | undefined) => {
    if (!services || !services.services) return
    services.services.forEach((service) => {
      if (!internalServices.has(service)) {
        requiredServices.add(service)
      }
    })
  }

  // 1. Services from used functions
  usedFunctions.forEach((funcName) => {
    const funcMeta = state.functions.meta[funcName]
    if (funcMeta?.services) {
      addServices(funcMeta.services)
    }
  })

  // 2. Services from used middleware (individual + groups)
  usedMiddleware.forEach((middlewareName) => {
    const middlewareMeta = state.middleware.meta[middlewareName]
    if (middlewareMeta?.services) {
      addServices(middlewareMeta.services)
    }
  })

  // 3. Services from used permissions (individual + groups)
  usedPermissions.forEach((permissionName) => {
    const permissionMeta = state.permissions.meta[permissionName]
    if (permissionMeta?.services) {
      addServices(permissionMeta.services)
    }
  })

  // 4. Services from middleware/permission groups used in wirings
  // We need to check all wirings and expand any tag/HTTP-pattern groups they use
  for (const method of [
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'head',
    'options',
  ] as const) {
    for (const routeMeta of Object.values(state.http.meta[method])) {
      expandAndAddGroupServices(routeMeta.middleware, state, addServices, true)
      expandAndAddGroupServices(
        routeMeta.permissions,
        state,
        addServices,
        false
      )
    }
  }

  // Also check other wiring types (channels, queues, schedulers, MCP)
  for (const channelMeta of Object.values(state.channels.meta)) {
    expandAndAddGroupServices(channelMeta.middleware, state, addServices, true)
    expandAndAddGroupServices(
      channelMeta.permissions,
      state,
      addServices,
      false
    )
  }

  for (const queueMeta of Object.values(state.queueWorkers.meta)) {
    expandAndAddGroupServices(queueMeta.middleware, state, addServices, true)
    // expandAndAddGroupServices(queueMeta.permissions, state, addServices, false)
  }

  for (const scheduleMeta of Object.values(state.scheduledTasks.meta)) {
    expandAndAddGroupServices(scheduleMeta.middleware, state, addServices, true)
    // expandAndAddGroupServices(scheduleMeta.permissions, state, addServices, false)
  }

  for (const toolMeta of Object.values(state.mcpEndpoints.toolsMeta)) {
    expandAndAddGroupServices(toolMeta.middleware, state, addServices, true)
    expandAndAddGroupServices(toolMeta.permissions, state, addServices, false)
  }

  for (const promptMeta of Object.values(state.mcpEndpoints.promptsMeta)) {
    expandAndAddGroupServices(promptMeta.middleware, state, addServices, true)
    expandAndAddGroupServices(promptMeta.permissions, state, addServices, false)
  }

  for (const resourceMeta of Object.values(state.mcpEndpoints.resourcesMeta)) {
    expandAndAddGroupServices(resourceMeta.middleware, state, addServices, true)
    expandAndAddGroupServices(
      resourceMeta.permissions,
      state,
      addServices,
      false
    )
  }

  // 5. Services from session service factories
  for (const singletonServices of state.wireServicesMeta.values()) {
    singletonServices.forEach((service) => {
      if (!internalServices.has(service)) {
        requiredServices.add(service)
      }
    })
  }
}

/**
 * Extract service interface metadata for all user-defined services.
 * This extracts metadata for services in SingletonServices and Services types
 * to generate documentation for AI consumption.
 *
 * Must be called after aggregateRequiredServices() to ensure types are loaded.
 */
export function extractServiceInterfaceMetadata(
  state: InspectorState | Omit<InspectorState, 'typesLookup'>,
  checker: ts.TypeChecker
): void {
  if (!('typesLookup' in state)) {
    return
  }

  const allMetadata: ServiceMetadata[] = []

  const singletonServicesTypes = state.typesLookup.get('SingletonServices')
  if (singletonServicesTypes && singletonServicesTypes.length > 0) {
    const singletonMeta = extractAllServiceMetadata(
      singletonServicesTypes[0],
      checker,
      state.rootDir
    )
    allMetadata.push(...singletonMeta)
  }

  const servicesTypes = state.typesLookup.get('Services')
  if (servicesTypes && servicesTypes.length > 0) {
    const wireServicesMeta = extractAllServiceMetadata(
      servicesTypes[0],
      checker,
      state.rootDir
    )

    const singletonNames = new Set(
      state.serviceAggregation.allSingletonServices
    )
    const uniqueWireServices = wireServicesMeta.filter(
      (meta) => !singletonNames.has(meta.name)
    )

    allMetadata.push(...uniqueWireServices)
  }

  state.serviceMetadata = allMetadata
}

/**
 * Validates credential overrides from external packages.
 * Ensures that each credential key in credentialOverrides exists in that
 * external package's credentials metadata.
 */
export function validateCredentialOverrides(
  logger: InspectorLogger,
  state: InspectorState | Omit<InspectorState, 'typesLookup'>,
  externalPackages?: Record<string, ExternalPackageConfig>
): void {
  if (!externalPackages) return

  const localCredentials = state.credentials.meta

  for (const [namespace, pkgConfig] of Object.entries(externalPackages)) {
    if (!pkgConfig.credentialOverrides) continue

    for (const credentialKey of Object.keys(pkgConfig.credentialOverrides)) {
      if (!localCredentials[credentialKey]) {
        const availableCredentials = Object.keys(localCredentials)
        logger.critical(
          ErrorCode.INVALID_VALUE,
          `Credential override '${credentialKey}' in external package '${namespace}' (${pkgConfig.package}) does not exist. Available credentials: ${availableCredentials.join(', ') || 'none'}`
        )
      }
    }
  }
}
