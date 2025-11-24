import { PikkuState } from './index.js'
import { HTTPWiringsMeta } from './wirings/http/http.types.js'
import {
  MCPResourceMeta,
  MCPToolMeta,
  MCPPromptMeta,
} from './wirings/mcp/mcp.types.js'
import { ScheduledTasksMeta } from './wirings/scheduler/scheduler.types.js'

declare global {
  // eslint-disable-next-line no-var
  var pikkuState: Map<string, PikkuState> | undefined
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
  Type extends keyof PikkuState,
  Content extends keyof PikkuState[Type],
>(
  packageName: string | null,
  type: Type,
  content: Content,
  value?: PikkuState[Type][Content]
): PikkuState[Type][Content] => {
  const resolvedPackageName = packageName ?? '__main__'

  // Initialize package state if it doesn't exist
  if (
    !globalThis.pikkuState ||
    !globalThis.pikkuState.has(resolvedPackageName)
  ) {
    initializePackageState(resolvedPackageName)
  }

  const packageState = globalThis.pikkuState!.get(resolvedPackageName)!

  if (value !== undefined) {
    packageState[type][content] = value
  }

  return packageState[type][content]
}

const createEmptyPackageState = (): PikkuState => ({
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
    errors: new Map(),
    schemas: new Map(),
    middleware: {},
    permissions: {},
  },
})

/**
 * Initialize state for a new package
 */
export const initializePackageState = (packageName: string): void => {
  if (!globalThis.pikkuState) {
    globalThis.pikkuState = new Map()
  }
  if (!globalThis.pikkuState.has(packageName)) {
    globalThis.pikkuState.set(packageName, createEmptyPackageState())
  }
}

export const resetPikkuState = () => {
  globalThis.pikkuState = new Map()
  initializePackageState('__main__')
}

if (!globalThis.pikkuState) {
  resetPikkuState()
}
