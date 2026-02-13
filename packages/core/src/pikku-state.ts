import { PikkuPackageState } from './index.js'
import { HTTPWiringsMeta } from './wirings/http/http.types.js'
import {
  MCPResourceMeta,
  MCPToolMeta,
  MCPPromptMeta,
} from './wirings/mcp/mcp.types.js'
import { ScheduledTasksMeta } from './wirings/scheduler/scheduler.types.js'
import { TriggerMeta } from './wirings/trigger/trigger.types.js'

declare global {
  // eslint-disable-next-line no-var
  var pikkuState: Map<string, PikkuPackageState> | undefined
}

/**
 * Get or set package-scoped pikku state
 *
 * @param packageName - Package name (null for main package, '@scope/package' for external packages)
 * @param type - State category (function, rpc, http, etc.)
 * @param content - Content key within the category
 * @param value - Optional value to set
 * @returns The current value of the state
 *
 * @example
 * // Main package
 * pikkuState(null, 'function', 'functions').get(funcName)
 *
 * // External package
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
  if (
    !globalThis.pikkuState ||
    !globalThis.pikkuState.has(resolvedPackageName)
  ) {
    initializePikkuState(resolvedPackageName)
  }

  const packageState = globalThis.pikkuState!.get(resolvedPackageName)!

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
    externalPackages: new Map(),
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
  },
  permissions: {
    tagGroup: {},
    httpGroup: {},
  },
  misc: {
    errors: new Map(),
    schemas: new Map(),
    middleware: {},
    permissions: {},
  },
  package: {
    factories: null,
    singletonServices: null,
  },
})

/**
 * Initialize state for a new package
 */
export const initializePikkuState = (packageName: string): void => {
  if (!globalThis.pikkuState) {
    globalThis.pikkuState = new Map()
  }
  if (!globalThis.pikkuState.has(packageName)) {
    globalThis.pikkuState.set(packageName, createEmptyPackageState())
  }
}

export const resetPikkuState = () => {
  // Preserve the errors map before resetting
  const existingErrors = globalThis.pikkuState?.get('__main__')?.misc.errors

  globalThis.pikkuState = new Map()
  initializePikkuState('__main__')

  // Restore the errors map if it existed
  if (existingErrors) {
    const mainState = globalThis.pikkuState.get('__main__')!
    mainState.misc.errors = existingErrors
  }
}

if (!globalThis.pikkuState) {
  resetPikkuState()
}

/**
 * Register service factories for an external package.
 * These factories are used to create services when the package's functions are invoked.
 *
 * @param packageName - The package name (e.g., '@pikku/templates-function-external')
 * @param factories - The service factory functions
 */
export const addPackageServiceFactories = (
  packageName: string,
  factories: NonNullable<PikkuPackageState['package']['factories']>
): void => {
  pikkuState(packageName, 'package', 'factories', factories)
}
