import { InspectorState } from './types.js'
import { FunctionServicesMeta } from '@pikku/core'
import { CLICommandMeta } from '@pikku/core'

/**
 * Aggregates all required services from wired functions, middleware, and permissions.
 * Must be called after AST traversal completes.
 */
export function aggregateRequiredServices(state: InspectorState): void {
  // Step 1: Find all used functions
  findUsedFunctions(state)

  // Step 2: For each used function, find middleware and permissions from meta
  findUsedMiddlewareAndPermissions(state)

  // Step 3: Aggregate services from all sources
  aggregateServicesFromAllSources(state)
}

/**
 * Finds all functions that are actually wired/exposed through any transport
 */
function findUsedFunctions(state: InspectorState): void {
  const { usedFunctions } = state.serviceAggregation

  // HTTP wirings
  for (const routes of Object.values(state.http.meta)) {
    for (const meta of Object.values(routes)) {
      usedFunctions.add(meta.pikkuFuncName)
    }
  }

  // Channels
  for (const meta of Object.values(state.channels.meta)) {
    // Connect handler
    if (meta.connect?.pikkuFuncName) {
      usedFunctions.add(meta.connect.pikkuFuncName)
    }
    // Disconnect handler
    if (meta.disconnect?.pikkuFuncName) {
      usedFunctions.add(meta.disconnect.pikkuFuncName)
    }
    // Default message handler
    if (meta.message?.pikkuFuncName) {
      usedFunctions.add(meta.message.pikkuFuncName)
    }
    // Message routing handlers
    for (const channelHandlers of Object.values(meta.messageWirings)) {
      for (const handler of Object.values(channelHandlers)) {
        if (handler.pikkuFuncName) {
          usedFunctions.add(handler.pikkuFuncName)
        }
      }
    }
  }

  // Schedulers
  for (const meta of Object.values(state.scheduledTasks.meta)) {
    usedFunctions.add(meta.pikkuFuncName)
  }

  // Queue workers
  for (const meta of Object.values(state.queueWorkers.meta)) {
    usedFunctions.add(meta.pikkuFuncName)
  }

  // MCP endpoints
  for (const meta of Object.values(state.mcpEndpoints.resourcesMeta)) {
    usedFunctions.add(meta.pikkuFuncName)
  }
  for (const meta of Object.values(state.mcpEndpoints.toolsMeta)) {
    usedFunctions.add(meta.pikkuFuncName)
  }
  for (const meta of Object.values(state.mcpEndpoints.promptsMeta)) {
    usedFunctions.add(meta.pikkuFuncName)
  }

  // CLI commands (recursive for subcommands)
  for (const programMeta of Object.values(state.cli.meta)) {
    extractCLIFunctions(programMeta.commands, usedFunctions)
  }

  // RPC exposed functions
  for (const funcName of Object.values(state.rpc.exposedMeta)) {
    usedFunctions.add(funcName)
  }
}

/**
 * Recursively extracts function names from CLI commands and subcommands
 */
function extractCLIFunctions(
  commands: Record<string, CLICommandMeta>,
  usedFunctions: Set<string>
): void {
  for (const commandMeta of Object.values(commands)) {
    usedFunctions.add(commandMeta.pikkuFuncName)
    // Recursively extract from subcommands
    if (commandMeta.subcommands) {
      extractCLIFunctions(commandMeta.subcommands, usedFunctions)
    }
  }
}

/**
 * Finds all middleware and permissions used by wired functions
 */
function findUsedMiddlewareAndPermissions(state: InspectorState): void {
  const { usedMiddleware, usedPermissions } = state.serviceAggregation

  // Helper to extract middleware/permission names from wire-level metadata only
  // (type: 'wire' has a name field, type: 'http'/'tag' reference groups, not individual functions)
  const extractNames = (
    list?:
      | Array<
          | { type: 'wire'; name: string }
          | { type: 'http'; route: string }
          | { type: 'tag'; tag: string }
        >
      | undefined
  ): string[] => {
    if (!list) return []
    return list
      .filter(
        (item): item is { type: 'wire'; name: string } => item.type === 'wire'
      )
      .map((item) => item.name)
  }

  // HTTP wirings
  for (const routes of Object.values(state.http.meta)) {
    for (const meta of Object.values(routes)) {
      extractNames(meta.middleware).forEach((name) => usedMiddleware.add(name))
      extractNames(meta.permissions).forEach((name) =>
        usedPermissions.add(name)
      )
    }
  }

  // Channels
  for (const meta of Object.values(state.channels.meta)) {
    extractNames(meta.middleware).forEach((name) => usedMiddleware.add(name))
    extractNames(meta.permissions).forEach((name) => usedPermissions.add(name))
    // Also check connect/disconnect/message handlers
    extractNames(meta.connect?.middleware).forEach((name) =>
      usedMiddleware.add(name)
    )
    extractNames(meta.connect?.permissions).forEach((name) =>
      usedPermissions.add(name)
    )
    extractNames(meta.disconnect?.middleware).forEach((name) =>
      usedMiddleware.add(name)
    )
    extractNames(meta.disconnect?.permissions).forEach((name) =>
      usedPermissions.add(name)
    )
    extractNames(meta.message?.middleware).forEach((name) =>
      usedMiddleware.add(name)
    )
    extractNames(meta.message?.permissions).forEach((name) =>
      usedPermissions.add(name)
    )
  }

  // Schedulers
  for (const meta of Object.values(state.scheduledTasks.meta)) {
    extractNames(meta.middleware).forEach((name) => usedMiddleware.add(name))
  }

  // Queue workers
  for (const meta of Object.values(state.queueWorkers.meta)) {
    extractNames(meta.middleware).forEach((name) => usedMiddleware.add(name))
  }

  // MCP endpoints
  for (const meta of Object.values(state.mcpEndpoints.resourcesMeta)) {
    extractNames(meta.middleware).forEach((name) => usedMiddleware.add(name))
    extractNames(meta.permissions).forEach((name) => usedPermissions.add(name))
  }
  for (const meta of Object.values(state.mcpEndpoints.toolsMeta)) {
    extractNames(meta.middleware).forEach((name) => usedMiddleware.add(name))
    extractNames(meta.permissions).forEach((name) => usedPermissions.add(name))
  }
  for (const meta of Object.values(state.mcpEndpoints.promptsMeta)) {
    extractNames(meta.middleware).forEach((name) => usedMiddleware.add(name))
    extractNames(meta.permissions).forEach((name) => usedPermissions.add(name))
  }

  // CLI commands (recursive for subcommands)
  for (const programMeta of Object.values(state.cli.meta)) {
    extractCLIMiddlewareAndPermissions(
      programMeta.commands,
      usedMiddleware,
      usedPermissions,
      extractNames
    )
  }
}

/**
 * Recursively extracts middleware and permissions from CLI commands and subcommands
 */
function extractCLIMiddlewareAndPermissions(
  commands: Record<string, CLICommandMeta>,
  usedMiddleware: Set<string>,
  usedPermissions: Set<string>,
  extractNames: (
    list?:
      | Array<
          | { type: 'wire'; name: string }
          | { type: 'http'; route: string }
          | { type: 'tag'; tag: string }
        >
      | undefined
  ) => string[]
): void {
  for (const commandMeta of Object.values(commands)) {
    extractNames(commandMeta.middleware).forEach((name) =>
      usedMiddleware.add(name)
    )
    extractNames(commandMeta.permissions).forEach((name) =>
      usedPermissions.add(name)
    )
    // Recursively extract from subcommands
    if (commandMeta.subcommands) {
      extractCLIMiddlewareAndPermissions(
        commandMeta.subcommands,
        usedMiddleware,
        usedPermissions,
        extractNames
      )
    }
  }
}

/**
 * Aggregates services from all sources: functions, middleware, permissions, session factories
 */
function aggregateServicesFromAllSources(state: InspectorState): void {
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
