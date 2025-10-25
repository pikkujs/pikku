import { InspectorState, InspectorFilters, InspectorLogger } from '../types.js'
import { PikkuWiringTypes } from '@pikku/core'
import { aggregateRequiredServices } from './post-process.js'

/**
 * Match a value against a pattern with wildcard support
 * Supports "*" at the beginning, end, or both (e.g., "send*", "*Payment", "*process*")
 */
function matchesWildcard(value: string, pattern: string): boolean {
  if (pattern === '*') return true

  const startsWithWildcard = pattern.startsWith('*')
  const endsWithWildcard = pattern.endsWith('*')

  if (startsWithWildcard && endsWithWildcard) {
    const middle = pattern.slice(1, -1)
    if (middle === '') return true
    return value.includes(middle)
  } else if (startsWithWildcard) {
    const suffix = pattern.slice(1)
    return value.endsWith(suffix) && value.length > suffix.length
  } else if (endsWithWildcard) {
    const prefix = pattern.slice(0, -1)
    return value.startsWith(prefix) && value.length > prefix.length
  }

  return value === pattern
}

/**
 * Check if metadata matches the given filters
 */
function matchesFilters(
  filters: InspectorFilters,
  meta: {
    type: PikkuWiringTypes
    name: string
    tags?: string[]
    filePath?: string
    httpRoute?: string
    httpMethod?: string
  },
  logger: InspectorLogger
): boolean {
  // If no filters, allow everything
  if (Object.keys(filters).length === 0) return true

  // If all filter arrays are empty, allow everything
  if (
    (!filters.names || filters.names.length === 0) &&
    (!filters.tags || filters.tags.length === 0) &&
    (!filters.types || filters.types.length === 0) &&
    (!filters.directories || filters.directories.length === 0) &&
    (!filters.httpRoutes || filters.httpRoutes.length === 0) &&
    (!filters.httpMethods || filters.httpMethods.length === 0)
  ) {
    return true
  }

  // Check type filter
  if (filters.types && filters.types.length > 0) {
    if (!filters.types.includes(meta.type)) {
      logger.debug(`⒡ Filtered by type: ${meta.type}:${meta.name}`)
      return false
    }
  }

  // Check directory filter
  if (filters.directories && filters.directories.length > 0 && meta.filePath) {
    const matchesDirectory = filters.directories.some((dir) => {
      const normalizedFilePath = meta.filePath!.replace(/\\/g, '/')
      const normalizedDir = dir.replace(/\\/g, '/')
      return normalizedFilePath.includes(normalizedDir)
    })

    if (!matchesDirectory) {
      logger.debug(`⒡ Filtered by directory: ${meta.type}:${meta.name}`)
      return false
    }
  }

  // Check tag filter
  if (filters.tags && filters.tags.length > 0) {
    if (!meta.tags || !filters.tags.some((tag) => meta.tags!.includes(tag))) {
      logger.debug(`⒡ Filtered by tags: ${meta.type}:${meta.name}`)
      return false
    }
  }

  // Check name filter
  if (filters.names && filters.names.length > 0) {
    const nameMatches = filters.names.some((pattern) =>
      matchesWildcard(meta.name, pattern)
    )
    if (!nameMatches) {
      logger.debug(`⒡ Filtered by name: ${meta.type}:${meta.name}`)
      return false
    }
  }

  // Check HTTP route filter
  if (filters.httpRoutes && filters.httpRoutes.length > 0 && meta.httpRoute) {
    const routeMatches = filters.httpRoutes.some((pattern) =>
      matchesWildcard(meta.httpRoute!, pattern)
    )
    if (!routeMatches) {
      logger.debug(`⒡ Filtered by HTTP route: ${meta.httpRoute}`)
      return false
    }
  }

  // Check HTTP method filter
  if (
    filters.httpMethods &&
    filters.httpMethods.length > 0 &&
    meta.httpMethod
  ) {
    const normalizedMethod = meta.httpMethod.toUpperCase()
    if (!filters.httpMethods.includes(normalizedMethod)) {
      logger.debug(`⒡ Filtered by HTTP method: ${meta.httpMethod}`)
      return false
    }
  }

  return true
}

/**
 * Extract wire names from middleware/permissions metadata
 */
function extractWireNames(obj: Record<string, any> | undefined): string[] {
  if (!obj) return []
  const names: string[] = []
  for (const key of Object.keys(obj)) {
    if (obj[key] && typeof obj[key] === 'object' && 'name' in obj[key]) {
      names.push(obj[key].name)
    }
  }
  return names
}

/**
 * Filters inspector state based on provided filters
 * This is applied post-inspection to support the inspect-once, filter-many pattern
 */
export function filterInspectorState(
  state: InspectorState | Omit<InspectorState, 'typesLookup'>,
  filters: InspectorFilters,
  logger: InspectorLogger
): typeof state {
  // If no filters, return original state
  if (
    Object.keys(filters).length === 0 ||
    ((!filters.names || filters.names.length === 0) &&
      (!filters.tags || filters.tags.length === 0) &&
      (!filters.types || filters.types.length === 0) &&
      (!filters.directories || filters.directories.length === 0) &&
      (!filters.httpRoutes || filters.httpRoutes.length === 0) &&
      (!filters.httpMethods || filters.httpMethods.length === 0))
  ) {
    return state
  }

  // Create a shallow copy with new Maps/Sets to avoid mutating the original
  const filteredState = {
    ...state,
    serviceAggregation: {
      ...state.serviceAggregation,
      requiredServices: new Set<string>(), // Reset requiredServices - will be recalculated
      usedFunctions: new Set<string>(),
      usedMiddleware: new Set<string>(),
      usedPermissions: new Set<string>(),
    },
    http: {
      ...state.http,
      meta: JSON.parse(JSON.stringify(state.http.meta)), // Deep clone metadata
    },
    channels: {
      ...state.channels,
      meta: JSON.parse(JSON.stringify(state.channels.meta)),
    },
    scheduledTasks: {
      ...state.scheduledTasks,
      meta: JSON.parse(JSON.stringify(state.scheduledTasks.meta)),
    },
    queueWorkers: {
      ...state.queueWorkers,
      meta: JSON.parse(JSON.stringify(state.queueWorkers.meta)),
    },
    mcpEndpoints: {
      ...state.mcpEndpoints,
      toolsMeta: JSON.parse(JSON.stringify(state.mcpEndpoints.toolsMeta)),
      resourcesMeta: JSON.parse(
        JSON.stringify(state.mcpEndpoints.resourcesMeta)
      ),
      promptsMeta: JSON.parse(JSON.stringify(state.mcpEndpoints.promptsMeta)),
    },
    cli: {
      ...state.cli,
      meta: JSON.parse(JSON.stringify(state.cli.meta)),
    },
  }

  // Filter HTTP routes
  for (const method of Object.keys(filteredState.http.meta)) {
    const routes = filteredState.http.meta[method]
    for (const route of Object.keys(routes)) {
      const routeMeta = routes[route]

      // Get function file path for directory filtering
      const funcFile = filteredState.functions.files.get(
        routeMeta.pikkuFuncName
      )
      const filePath = funcFile?.path

      const matches = matchesFilters(
        filters,
        {
          type: 'http' as PikkuWiringTypes,
          name: routeMeta.pikkuFuncName, // Use function name, not route
          tags: routeMeta.tags,
          filePath,
          httpRoute: routeMeta.route,
          httpMethod: routeMeta.method,
        },
        logger
      )

      if (!matches) {
        delete routes[route]
      } else {
        // Track used functions/middleware/permissions
        if (routeMeta.pikkuFuncName) {
          filteredState.serviceAggregation.usedFunctions.add(
            routeMeta.pikkuFuncName
          )
        }
        extractWireNames(routeMeta.middleware).forEach((name: string) =>
          filteredState.serviceAggregation.usedMiddleware.add(name)
        )
        extractWireNames(routeMeta.permissions).forEach((name: string) =>
          filteredState.serviceAggregation.usedPermissions.add(name)
        )
      }
    }
  }

  // Filter channels
  for (const name of Object.keys(filteredState.channels.meta)) {
    const channelMeta = filteredState.channels.meta[name]
    const matches = matchesFilters(
      filters,
      {
        type: 'channel' as PikkuWiringTypes,
        name,
        tags: channelMeta.tags,
      },
      logger
    )

    if (!matches) {
      delete filteredState.channels.meta[name]
    } else {
      if (channelMeta.pikkuFuncName) {
        filteredState.serviceAggregation.usedFunctions.add(
          channelMeta.pikkuFuncName
        )
      }
      extractWireNames(channelMeta.middleware).forEach((name: string) =>
        filteredState.serviceAggregation.usedMiddleware.add(name)
      )
      extractWireNames(channelMeta.permissions).forEach((name: string) =>
        filteredState.serviceAggregation.usedPermissions.add(name)
      )
    }
  }

  // Filter scheduled tasks
  for (const name of Object.keys(filteredState.scheduledTasks.meta)) {
    const taskMeta = filteredState.scheduledTasks.meta[name]
    const matches = matchesFilters(
      filters,
      {
        type: 'scheduler' as PikkuWiringTypes,
        name,
        tags: taskMeta.tags,
      },
      logger
    )

    if (!matches) {
      delete filteredState.scheduledTasks.meta[name]
    } else {
      if (taskMeta.pikkuFuncName) {
        filteredState.serviceAggregation.usedFunctions.add(
          taskMeta.pikkuFuncName
        )
      }
      extractWireNames(taskMeta.middleware).forEach((name: string) =>
        filteredState.serviceAggregation.usedMiddleware.add(name)
      )
    }
  }

  // Filter queue workers
  for (const name of Object.keys(filteredState.queueWorkers.meta)) {
    const workerMeta = filteredState.queueWorkers.meta[name]
    const matches = matchesFilters(
      filters,
      {
        type: 'queue' as PikkuWiringTypes,
        name,
        tags: workerMeta.tags,
      },
      logger
    )

    if (!matches) {
      delete filteredState.queueWorkers.meta[name]
    } else {
      if (workerMeta.pikkuFuncName) {
        filteredState.serviceAggregation.usedFunctions.add(
          workerMeta.pikkuFuncName
        )
      }
      extractWireNames(workerMeta.middleware).forEach((name: string) =>
        filteredState.serviceAggregation.usedMiddleware.add(name)
      )
    }
  }

  // Filter MCP tools
  for (const name of Object.keys(filteredState.mcpEndpoints.toolsMeta)) {
    const toolMeta = filteredState.mcpEndpoints.toolsMeta[name]
    const matches = matchesFilters(
      filters,
      {
        type: 'mcp' as PikkuWiringTypes,
        name,
        tags: toolMeta.tags,
      },
      logger
    )

    if (!matches) {
      delete filteredState.mcpEndpoints.toolsMeta[name]
    } else {
      if (toolMeta.pikkuFuncName) {
        filteredState.serviceAggregation.usedFunctions.add(
          toolMeta.pikkuFuncName
        )
      }
      extractWireNames(toolMeta.middleware).forEach((name: string) =>
        filteredState.serviceAggregation.usedMiddleware.add(name)
      )
      extractWireNames(toolMeta.permissions).forEach((name: string) =>
        filteredState.serviceAggregation.usedPermissions.add(name)
      )
    }
  }

  // Filter MCP resources
  for (const name of Object.keys(filteredState.mcpEndpoints.resourcesMeta)) {
    const resourceMeta = filteredState.mcpEndpoints.resourcesMeta[name]
    const matches = matchesFilters(
      filters,
      {
        type: 'mcp' as PikkuWiringTypes,
        name,
        tags: resourceMeta.tags,
      },
      logger
    )

    if (!matches) {
      delete filteredState.mcpEndpoints.resourcesMeta[name]
    } else {
      if (resourceMeta.pikkuFuncName) {
        filteredState.serviceAggregation.usedFunctions.add(
          resourceMeta.pikkuFuncName
        )
      }
      extractWireNames(resourceMeta.middleware).forEach((name: string) =>
        filteredState.serviceAggregation.usedMiddleware.add(name)
      )
      extractWireNames(resourceMeta.permissions).forEach((name: string) =>
        filteredState.serviceAggregation.usedPermissions.add(name)
      )
    }
  }

  // Filter MCP prompts
  for (const name of Object.keys(filteredState.mcpEndpoints.promptsMeta)) {
    const promptMeta = filteredState.mcpEndpoints.promptsMeta[name]
    const matches = matchesFilters(
      filters,
      {
        type: 'mcp' as PikkuWiringTypes,
        name,
        tags: promptMeta.tags,
      },
      logger
    )

    if (!matches) {
      delete filteredState.mcpEndpoints.promptsMeta[name]
    } else {
      if (promptMeta.pikkuFuncName) {
        filteredState.serviceAggregation.usedFunctions.add(
          promptMeta.pikkuFuncName
        )
      }
      extractWireNames(promptMeta.middleware).forEach((name: string) =>
        filteredState.serviceAggregation.usedMiddleware.add(name)
      )
      extractWireNames(promptMeta.permissions).forEach((name: string) =>
        filteredState.serviceAggregation.usedPermissions.add(name)
      )
    }
  }

  // Filter CLI programs (note: CLI filtering might be more complex with nested commands)
  for (const programName of Object.keys(filteredState.cli.meta.programs)) {
    const programMeta = filteredState.cli.meta.programs[programName]

    // Filter commands in the program
    for (const commandName of Object.keys(programMeta.commands)) {
      const commandMeta = programMeta.commands[commandName]
      const matches = matchesFilters(
        filters,
        {
          type: 'cli' as PikkuWiringTypes,
          name: commandName,
          tags: commandMeta.tags,
        },
        logger
      )

      if (!matches) {
        delete programMeta.commands[commandName]
      } else {
        if (commandMeta.pikkuFuncName) {
          filteredState.serviceAggregation.usedFunctions.add(
            commandMeta.pikkuFuncName
          )
        }
        extractWireNames(commandMeta.middleware).forEach((name: string) =>
          filteredState.serviceAggregation.usedMiddleware.add(name)
        )
      }
    }

    // Remove program if it has no commands left
    if (Object.keys(programMeta.commands).length === 0) {
      delete filteredState.cli.meta.programs[programName]
    }
  }

  // Recalculate requiredServices based on filtered functions/middleware/permissions
  // Need to cast to InspectorState temporarily for aggregateRequiredServices
  const stateForAggregation = filteredState as InspectorState
  aggregateRequiredServices(stateForAggregation)

  return filteredState
}
