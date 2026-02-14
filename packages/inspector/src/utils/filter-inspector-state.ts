import { InspectorState, InspectorFilters, InspectorLogger } from '../types.js'
import { PikkuWiringTypes, parseVersionedId } from '@pikku/core'
import { aggregateRequiredServices } from './post-process.js'

// Module-level Set to track warned groups across multiple filter calls
const globalWarnedGroups = new Set<string>()

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
    groupBasePath?: string
  },
  logger: InspectorLogger,
  warnedGroups?: Set<string>
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

  // Check name filter (match against both full ID and base name for versioned functions)
  if (filters.names && filters.names.length > 0) {
    const { baseName } = parseVersionedId(meta.name)
    const nameMatches = filters.names.some(
      (pattern) =>
        matchesWildcard(meta.name, pattern) ||
        (baseName !== meta.name && matchesWildcard(baseName, pattern))
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

    // If route is part of a wireHTTPRoutes group, check if filter is at group level
    if (meta.groupBasePath && warnedGroups) {
      const groupMatches = filters.httpRoutes.some(
        (pattern) =>
          matchesWildcard(meta.groupBasePath!, pattern) ||
          matchesWildcard(meta.groupBasePath! + '/*', pattern)
      )
      if (!groupMatches && !warnedGroups.has(meta.groupBasePath)) {
        warnedGroups.add(meta.groupBasePath)
        logger.warn(
          `Filtering within wireHTTPRoutes group is not yet supported. ` +
            `Route '${meta.httpRoute}' is part of group '${meta.groupBasePath}'. ` +
            `Use '--httpRoutes=${meta.groupBasePath}/*' to filter the entire group.`
        )
      }
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
      files: new Set<string>(), // Will be repopulated with filtered files
    },
    channels: {
      ...state.channels,
      meta: JSON.parse(JSON.stringify(state.channels.meta)),
      files: new Set<string>(), // Will be repopulated with filtered files
    },
    triggers: {
      ...state.triggers,
      meta: JSON.parse(JSON.stringify(state.triggers?.meta ?? {})),
      files: new Set<string>(),
    },
    scheduledTasks: {
      ...state.scheduledTasks,
      meta: JSON.parse(JSON.stringify(state.scheduledTasks.meta)),
      files: new Set<string>(), // Will be repopulated with filtered files
    },
    queueWorkers: {
      ...state.queueWorkers,
      meta: JSON.parse(JSON.stringify(state.queueWorkers.meta)),
      files: new Set<string>(), // Will be repopulated with filtered files
    },
    mcpEndpoints: {
      ...state.mcpEndpoints,
      toolsMeta: JSON.parse(JSON.stringify(state.mcpEndpoints.toolsMeta)),
      resourcesMeta: JSON.parse(
        JSON.stringify(state.mcpEndpoints.resourcesMeta)
      ),
      promptsMeta: JSON.parse(JSON.stringify(state.mcpEndpoints.promptsMeta)),
      files: new Set<string>(), // Will be repopulated with filtered files
    },
    cli: {
      ...state.cli,
      meta: JSON.parse(JSON.stringify(state.cli.meta)),
      files: new Set<string>(), // Will be repopulated with filtered files
    },
  }

  // Filter HTTP routes
  for (const method of Object.keys(filteredState.http.meta)) {
    const routes = filteredState.http.meta[method]
    for (const route of Object.keys(routes)) {
      const routeMeta = routes[route]

      // Get function file path for directory filtering
      const funcFile = filteredState.functions.files.get(routeMeta.pikkuFuncId)
      const filePath = funcFile?.path

      const matches = matchesFilters(
        filters,
        {
          type: 'http' as PikkuWiringTypes,
          name: routeMeta.pikkuFuncId, // Use function name, not route
          tags: routeMeta.tags,
          filePath,
          httpRoute: routeMeta.route,
          httpMethod: routeMeta.method,
          groupBasePath: routeMeta.groupBasePath,
        },
        logger,
        globalWarnedGroups
      )

      if (!matches) {
        delete routes[route]
      } else {
        // Track used functions/middleware/permissions
        if (routeMeta.pikkuFuncId) {
          filteredState.serviceAggregation.usedFunctions.add(
            routeMeta.pikkuFuncId
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

  // Repopulate http.files if any routes remain
  const hasHttpRoutes = Object.values(
    filteredState.http.meta as Record<string, any>
  ).some((routes) => Object.keys(routes).length > 0)
  if (hasHttpRoutes) {
    filteredState.http.files = new Set(state.http.files)
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
      if (channelMeta.pikkuFuncId) {
        filteredState.serviceAggregation.usedFunctions.add(
          channelMeta.pikkuFuncId
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

  // Repopulate channels.files if any channels remain
  if (Object.keys(filteredState.channels.meta).length > 0) {
    filteredState.channels.files = new Set(state.channels.files)
  }

  // Filter triggers
  for (const name of Object.keys(filteredState.triggers.meta)) {
    const triggerMeta = filteredState.triggers.meta[name]
    const matches = matchesFilters(
      filters,
      {
        type: 'trigger' as PikkuWiringTypes,
        name,
        tags: triggerMeta.tags,
      },
      logger
    )

    if (!matches) {
      delete filteredState.triggers.meta[name]
    } else {
      if (triggerMeta.pikkuFuncId) {
        filteredState.serviceAggregation.usedFunctions.add(
          triggerMeta.pikkuFuncId
        )
      }
    }
  }

  // Repopulate triggers.files if any triggers remain
  if (Object.keys(filteredState.triggers.meta).length > 0) {
    filteredState.triggers.files = new Set(state.triggers.files)
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
      if (taskMeta.pikkuFuncId) {
        filteredState.serviceAggregation.usedFunctions.add(taskMeta.pikkuFuncId)
      }
      extractWireNames(taskMeta.middleware).forEach((name: string) =>
        filteredState.serviceAggregation.usedMiddleware.add(name)
      )
    }
  }

  // Repopulate scheduledTasks.files if any tasks remain
  if (Object.keys(filteredState.scheduledTasks.meta).length > 0) {
    filteredState.scheduledTasks.files = new Set(state.scheduledTasks.files)
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
      if (workerMeta.pikkuFuncId) {
        filteredState.serviceAggregation.usedFunctions.add(
          workerMeta.pikkuFuncId
        )
      }
      extractWireNames(workerMeta.middleware).forEach((name: string) =>
        filteredState.serviceAggregation.usedMiddleware.add(name)
      )
    }
  }

  // Repopulate queueWorkers.files if any workers remain
  if (Object.keys(filteredState.queueWorkers.meta).length > 0) {
    filteredState.queueWorkers.files = new Set(state.queueWorkers.files)
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
      if (toolMeta.pikkuFuncId) {
        filteredState.serviceAggregation.usedFunctions.add(toolMeta.pikkuFuncId)
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
      if (resourceMeta.pikkuFuncId) {
        filteredState.serviceAggregation.usedFunctions.add(
          resourceMeta.pikkuFuncId
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
      if (promptMeta.pikkuFuncId) {
        filteredState.serviceAggregation.usedFunctions.add(
          promptMeta.pikkuFuncId
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

  // Repopulate mcpEndpoints.files if any MCP endpoints remain
  const hasMcpEndpoints =
    Object.keys(filteredState.mcpEndpoints.toolsMeta).length > 0 ||
    Object.keys(filteredState.mcpEndpoints.resourcesMeta).length > 0 ||
    Object.keys(filteredState.mcpEndpoints.promptsMeta).length > 0
  if (hasMcpEndpoints) {
    filteredState.mcpEndpoints.files = new Set(state.mcpEndpoints.files)
  }

  // Filter CLI programs (note: CLI filtering might be more complex with nested commands)
  const referencedRenderers = new Set<string>()

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
        if (commandMeta.pikkuFuncId) {
          filteredState.serviceAggregation.usedFunctions.add(
            commandMeta.pikkuFuncId
          )
        }
        extractWireNames(commandMeta.middleware).forEach((name: string) =>
          filteredState.serviceAggregation.usedMiddleware.add(name)
        )
        // Track referenced renderers
        if (commandMeta.defaultRenderName) {
          referencedRenderers.add(commandMeta.defaultRenderName)
        }
      }
    }

    // Remove program if it has no commands left
    if (Object.keys(programMeta.commands).length === 0) {
      delete filteredState.cli.meta.programs[programName]
    }
  }

  // Filter out renderers that aren't referenced by any remaining commands
  for (const rendererName of Object.keys(
    filteredState.cli.meta.renderers || {}
  )) {
    if (!referencedRenderers.has(rendererName)) {
      delete filteredState.cli.meta.renderers![rendererName]
    }
  }

  // Repopulate cli.files if any CLI programs or referenced renderers remain
  const hasCliPrograms = Object.keys(filteredState.cli.meta.programs).length > 0
  const hasCliRenderers =
    Object.keys(filteredState.cli.meta.renderers || {}).length > 0
  if (hasCliPrograms || hasCliRenderers) {
    filteredState.cli.files = new Set(state.cli.files)
  }

  // Post-filter version expansion: include all versions of matched functions
  const includedBaseNames = new Set<string>()
  for (const funcId of filteredState.serviceAggregation.usedFunctions) {
    const { baseName } = parseVersionedId(funcId)
    includedBaseNames.add(baseName)
  }
  if (includedBaseNames.size > 0) {
    for (const funcId of Object.keys(state.functions.meta)) {
      const { baseName } = parseVersionedId(funcId)
      if (includedBaseNames.has(baseName)) {
        filteredState.serviceAggregation.usedFunctions.add(funcId)
      }
    }
  }

  // Recalculate requiredServices based on filtered functions/middleware/permissions
  // Need to cast to InspectorState temporarily for aggregateRequiredServices
  const stateForAggregation = filteredState as InspectorState
  aggregateRequiredServices(stateForAggregation)

  return filteredState
}
