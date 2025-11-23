import { ChannelsMeta, CoreChannel } from './wirings/channel/channel.types.js'
import {
  CoreHTTPFunctionWiring,
  HTTPMethod,
  HTTPWiringsMeta,
} from './wirings/http/http.types.js'
import {
  FunctionsMeta,
  CorePikkuMiddleware,
  CorePikkuMiddlewareGroup,
  FunctionServicesMeta,
} from './types/core.types.js'
import {
  CoreScheduledTask,
  ScheduledTasksMeta,
} from './wirings/scheduler/scheduler.types.js'
import { ErrorDetails, PikkuError } from './errors/error-handler.js'
import {
  CorePermissionGroup,
  CorePikkuFunctionConfig,
  CorePikkuPermission,
} from './function/functions.types.js'
import {
  QueueWorkersMeta,
  CoreQueueWorker,
} from './wirings/queue/queue.types.js'
import {
  CoreMCPResource,
  CoreMCPTool,
  CoreMCPPrompt,
  MCPResourceMeta,
  MCPToolMeta,
  MCPPromptMeta,
} from './wirings/mcp/mcp.types.js'
import { CLIMeta, CLIProgramState } from './wirings/cli/cli.types.js'
import {
  CoreWorkflow,
  WorkflowsMeta,
} from './wirings/workflow/workflow.types.js'

interface PackagePikkuState {
  function: {
    meta: FunctionsMeta
    functions: Map<string, CorePikkuFunctionConfig<any, any>>
  }
  rpc: {
    meta: Record<string, string>
    files: Map<
      string,
      {
        exportedName: string
        path: string
      }
    >
  }
  http: {
    middleware: Map<string, CorePikkuMiddleware<any, any>[]>
    permissions: Map<string, CorePermissionGroup | CorePikkuPermission[]>
    routes: Map<HTTPMethod, Map<string, CoreHTTPFunctionWiring<any, any, any>>>
    meta: HTTPWiringsMeta
  }
  channel: {
    channels: Map<string, CoreChannel<any, any>>
    meta: ChannelsMeta
  }
  scheduler: {
    tasks: Map<string, CoreScheduledTask>
    meta: ScheduledTasksMeta
  }
  queue: {
    registrations: Map<string, CoreQueueWorker>
    meta: QueueWorkersMeta
  }
  workflows: {
    registrations: Map<string, CoreWorkflow>
    meta: WorkflowsMeta
  }
  mcp: {
    resources: Map<string, CoreMCPResource>
    resourcesMeta: MCPResourceMeta
    tools: Map<string, CoreMCPTool>
    toolsMeta: MCPToolMeta
    prompts: Map<string, CoreMCPPrompt>
    promptsMeta: MCPPromptMeta
  }
  cli: {
    meta: CLIMeta | Record<string, any> // Backward compatible with old published CLI format
    programs: Record<string, CLIProgramState>
  }
  middleware: {
    tagGroup: Record<string, CorePikkuMiddlewareGroup>
    httpGroup: Record<string, CorePikkuMiddlewareGroup>
    tagGroupMeta: Record<
      string,
      {
        exportName: string | null
        sourceFile: string
        position: number
        services: FunctionServicesMeta
        middlewareCount: number
        isFactory: boolean
      }
    >
    httpGroupMeta: Record<
      string,
      {
        exportName: string | null
        sourceFile: string
        position: number
        services: FunctionServicesMeta
        middlewareCount: number
        isFactory: boolean
      }
    >
  }
  permissions: {
    tagGroup: Record<string, CorePermissionGroup | CorePikkuPermission[]>
    httpGroup: Record<string, CorePermissionGroup | CorePikkuPermission[]>
    tagGroupMeta: Record<
      string,
      {
        exportName: string | null
        sourceFile: string
        position: number
        services: FunctionServicesMeta
        permissionCount: number
        isFactory: boolean
      }
    >
    httpGroupMeta: Record<
      string,
      {
        exportName: string | null
        sourceFile: string
        position: number
        services: FunctionServicesMeta
        permissionCount: number
        isFactory: boolean
      }
    >
  }
  misc: {
    errors: Map<PikkuError, ErrorDetails>
    schemas: Map<string, any>
    middleware: Record<string, CorePikkuMiddleware[]>
    permissions: Record<string, CorePermissionGroup | CorePikkuPermission[]>
  }
}

interface PikkuState {
  packages: Map<string, PackagePikkuState>
}

const createEmptyPackageState = (
  preserveErrors?: Map<PikkuError, ErrorDetails>
): PackagePikkuState => ({
  function: {
    meta: {},
    functions: new Map(),
  },
  rpc: {
    meta: {},
    files: new Map(),
  },
  http: {
    middleware: new Map(),
    permissions: new Map(),
    routes: new Map(),
    meta: {
      post: {},
      get: {},
      delete: {},
      patch: {},
      head: {},
      put: {},
      options: {},
    } as HTTPWiringsMeta,
  },
  channel: {
    channels: new Map(),
    meta: {},
  },
  scheduler: {
    tasks: new Map(),
    meta: [] as unknown as ScheduledTasksMeta,
  },
  queue: {
    registrations: new Map(),
    meta: {},
  },
  workflows: {
    registrations: new Map(),
    meta: {},
  },
  mcp: {
    resources: new Map(),
    resourcesMeta: {} as MCPResourceMeta,
    tools: new Map(),
    toolsMeta: {} as MCPToolMeta,
    prompts: new Map(),
    promptsMeta: {} as MCPPromptMeta,
  },
  cli: {
    meta: { programs: {}, renderers: {} },
    programs: {},
  },
  middleware: {
    tagGroup: {},
    httpGroup: {},
    tagGroupMeta: {},
    httpGroupMeta: {},
  },
  permissions: {
    tagGroup: {},
    httpGroup: {},
    tagGroupMeta: {},
    httpGroupMeta: {},
  },
  misc: {
    errors: preserveErrors || new Map(),
    schemas: new Map(),
    middleware: {},
    permissions: {},
  },
})

export const resetPikkuState = () => {
  const existingErrors = globalThis.pikkuState?.packages?.get('')?.misc?.errors
  const mainPackageState = createEmptyPackageState(existingErrors)

  globalThis.pikkuState = {
    packages: new Map([['', mainPackageState]]),
  } as PikkuState
}

if (!globalThis.pikkuState) {
  resetPikkuState()
}

/**
 * Initialize state for a new package
 */
export const initializePackageState = (packageName: string): void => {
  if (!globalThis.pikkuState.packages.has(packageName)) {
    globalThis.pikkuState.packages.set(packageName, createEmptyPackageState())
  }
}

/**
 * Get or set package-scoped pikku state
 *
 * @param packageName - Package name (empty string '' for main package, '@scope/package' for external packages)
 * @param type - State category (function, rpc, http, etc.)
 * @param content - Content key within the category
 * @param value - Optional value to set
 * @returns The current value of the state
 *
 * @example
 * // Main package
 * pikkuState('', 'function', 'functions').get(funcName)
 *
 * // External package
 * pikkuState('@acme/stripe-functions', 'rpc', 'meta')
 */
export const pikkuState = <
  Type extends keyof PackagePikkuState,
  Content extends keyof PackagePikkuState[Type],
>(
  packageName: string,
  type: Type,
  content: Content,
  value?: PackagePikkuState[Type][Content]
): PackagePikkuState[Type][Content] => {
  // Initialize package state if it doesn't exist
  if (!globalThis.pikkuState.packages.has(packageName)) {
    initializePackageState(packageName)
  }

  const packageState = globalThis.pikkuState.packages.get(packageName)!

  if (value !== undefined) {
    packageState[type][content] = value
  }

  return packageState[type][content]
}

// Export types for external use
export type { PackagePikkuState, PikkuState }
