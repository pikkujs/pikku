import { InspectorState } from './types.js'
import {
  FunctionServicesMeta,
  MiddlewareMetadata,
  PermissionMetadata,
} from '@pikku/core'

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
 * Aggregates all required services from wired functions, middleware, and permissions.
 * Must be called after AST traversal completes.
 *
 * Note: usedFunctions, usedMiddleware, and usedPermissions are tracked directly
 * in the add-* methods during AST traversal for efficiency.
 */
export function aggregateRequiredServices(state: InspectorState): void {
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

  // 2. Services from used middleware
  usedMiddleware.forEach((middlewareName) => {
    const middlewareMeta = state.middleware.meta[middlewareName]
    if (middlewareMeta?.services) {
      addServices(middlewareMeta.services)
    }
  })

  // 3. Services from used permissions
  usedPermissions.forEach((permissionName) => {
    const permissionMeta = state.permissions.meta[permissionName]
    if (permissionMeta?.services) {
      addServices(permissionMeta.services)
    }
  })

  // 4. Services from session service factories
  for (const singletonServices of state.sessionServicesMeta.values()) {
    singletonServices.forEach((service) => {
      if (!internalServices.has(service)) {
        requiredServices.add(service)
      }
    })
  }
}
