import type { PikkuPackageState } from './index.js'
import type {
  CoreSingletonServices,
  CreateWireServices,
} from './types/core.types.js'
import type { HTTPWiringsMeta } from './wirings/http/http.types.js'
import type {
  MCPResourceMeta,
  MCPToolMeta,
  MCPPromptMeta,
} from './wirings/mcp/mcp.types.js'
import type { AIAgentMeta } from './wirings/ai-agent/ai-agent.types.js'
import type { ScheduledTasksMeta } from './wirings/scheduler/scheduler.types.js'
import type { TriggerMeta } from './wirings/trigger/trigger.types.js'

const PIKKU_STATE_KEY = Symbol.for('@pikku/core/state')

export const getAllPackageStates = (): Map<string, PikkuPackageState> => {
  if (!(globalThis as any)[PIKKU_STATE_KEY]) {
    ;(globalThis as any)[PIKKU_STATE_KEY] = new Map<string, PikkuPackageState>()
  }
  return (globalThis as any)[PIKKU_STATE_KEY] as Map<string, PikkuPackageState>
}

/**
 * Get or set package-scoped pikku state
 *
 * @param packageName - Package name (null for main package, '@scope/package' for addon packages)
 * @param type - State category (function, rpc, http, etc.)
 * @param content - Content key within the category
 * @param value - Optional value to set
 * @returns The current value of the state
 *
 * @example
 * // Main package
 * pikkuState(null, 'function', 'functions').get(funcName)
 *
 * // Addon package
 * pikkuState('@acme/stripe-functions', 'rpc', 'meta')
 */
export const pikkuState = <
  Type extends keyof PikkuPackageState,
  Content extends keyof PikkuPackageState[Type],
>(
  packageName: string | null,
  type: Type,
  content: Content,
  value?: PikkuPackageState[Type][Content]
): PikkuPackageState[Type][Content] => {
  const resolvedPackageName = packageName ?? '__main__'

  // Initialize package state if it doesn't exist
  if (!getAllPackageStates().has(resolvedPackageName)) {
    initializePikkuState(resolvedPackageName)
  }

  const packageState = getAllPackageStates().get(resolvedPackageName)!

  if (value !== undefined) {
    packageState[type][content] = value
  }

  return packageState[type][content]
}

const createEmptyPackageState = (): PikkuPackageState => ({
  function: {
    meta: {},
    functions: new Map(),
  },
  rpc: {
    meta: {},
    files: new Map(),
    addons: new Map(),
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
  trigger: {
    functions: new Map(),
    triggers: new Map(),
    triggerSources: new Map(),
    meta: {} as TriggerMeta,
    sourceMeta: {},
  },
  mcp: {
    resources: new Map(),
    resourcesMeta: {} as MCPResourceMeta,
    toolsMeta: {} as MCPToolMeta,
    prompts: new Map(),
    promptsMeta: {} as MCPPromptMeta,
  },
  agent: {
    agents: new Map(),
    agentsMeta: {} as AIAgentMeta,
  },
  cli: {
    meta: { programs: {}, renderers: {} },
    programs: {},
  },
  middleware: {
    tagGroup: {},
    httpGroup: {},
  },
  channelMiddleware: {
    tagGroup: {},
  },
  permissions: {
    tagGroup: {},
    httpGroup: {},
  },
  misc: {
    errors: new Map(),
    schemas: new Map(),
    middleware: {},
    channelMiddleware: {},
    permissions: {},
  },
  models: {
    config: null,
  },
  package: {
    factories: null,
    singletonServices: null,
    metaDir: null,
  },
})

/**
 * Initialize state for a new package
 */
export const initializePikkuState = (packageName: string): void => {
  if (!getAllPackageStates().has(packageName)) {
    getAllPackageStates().set(packageName, createEmptyPackageState())
  }
}

export const resetPikkuState = () => {
  // Preserve the errors map before resetting
  const existingErrors = getAllPackageStates().get('__main__')?.misc.errors

  ;(globalThis as any)[PIKKU_STATE_KEY] = new Map<string, PikkuPackageState>()
  initializePikkuState('__main__')

  // Restore the errors map if it existed
  if (existingErrors) {
    const mainState = getAllPackageStates().get('__main__')!
    mainState.misc.errors = existingErrors
  }
}

if (!getAllPackageStates().has('__main__')) {
  resetPikkuState()
}

export const getPikkuMetaDir = (packageName?: string | null): string | null => {
  return pikkuState(packageName ?? null, 'package', 'metaDir')
}

export const getSingletonServices = (): CoreSingletonServices => {
  const services = pikkuState(null, 'package', 'singletonServices')
  if (!services) throw new Error('Singleton services not initialized')
  return services
}

export const getCreateWireServices = (): CreateWireServices | undefined => {
  return pikkuState(null, 'package', 'factories')?.createWireServices
}

/**
 * Register service factories for an addon package.
 * These factories are used to create services when the package's functions are invoked.
 *
 * @param packageName - The package name (e.g., '@pikku/templates-function-addon')
 * @param factories - The service factory functions
 */
export const addPackageServiceFactories = (
  packageName: string,
  factories: NonNullable<PikkuPackageState['package']['factories']>
): void => {
  pikkuState(packageName, 'package', 'factories', factories)
}
