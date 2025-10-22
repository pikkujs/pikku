import { InspectorState } from '../types.js'
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
 * Helper to expand middleware/permission groups into individual names
 * and add their services to the aggregation.
 * This handles tag-based and HTTP-pattern-based middleware/permission groups.
 */
function expandAndAddGroupServices(
  list: MiddlewareMetadata[] | PermissionMetadata[] | undefined,
  state: InspectorState,
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
  for (const singletonServices of state.sessionServicesMeta.values()) {
    singletonServices.forEach((service) => {
      if (!internalServices.has(service)) {
        requiredServices.add(service)
      }
    })
  }
}
