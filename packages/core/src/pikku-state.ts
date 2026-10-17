import type { PikkuPackageState } from './types/state.types.js'
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
import type { AgentsMeta } from './wirings/agent/agent.types.js'
import type { ScorerMeta } from './wirings/agent-scorer/agent-scorer.types.js'
import type { GatewaysMeta } from './wirings/gateway/gateway.types.js'
import type { ScheduledTasksMeta } from './wirings/scheduler/scheduler.types.js'
import type { TriggerMeta } from './wirings/trigger/trigger.types.js'

const PIKKU_STATE_KEY = Symbol.for('@pikku/core/state')

/**
 * State is parked on `globalThis` under a registered symbol so separate copies
 * of @pikku/core in one process share it. Typed once here rather than at each
 * access.
 */
const stateHost = globalThis as unknown as {
  [key: symbol]: Map<string, PikkuPackageState> | undefined
}

/**
 * Every package's registry, keyed by package name (`__main__` for the app).
 * The map lives on `globalThis` under a registered symbol, so duplicate copies
 * of `@pikku/core` in one process share it.
 * @internal
 */
export const getAllPackageStates = (): Map<string, PikkuPackageState> => {
  let states = stateHost[PIKKU_STATE_KEY]
  if (!states) {
    states = new Map<string, PikkuPackageState>()
    stateHost[PIKKU_STATE_KEY] = states
  }
  return states
}

/**
 * Reads, or with `value` replaces, one slot of a package's registry: the
 * functions, wirings, metadata, middleware and services that generated code and
 * the `wire*` helpers register at import time.
 *
 * This is framework plumbing, not app state. Generated bootstrap files and
 * runtime adapters call it; application code should go through the `wire*`,
 * `add*` and `define*` helpers instead, because writing a slot directly
 * bypasses the validation they do.
 *
 * @param packageName - The package whose registry to use; `null` means the app.
 * The registry is created on first use.
 * @param type - The area, such as `'function'`, `'http'` or `'misc'`.
 * @param content - The slot within that area.
 * @param value - When given, replaces the slot. `undefined` cannot be stored;
 * it always reads.
 * @returns The slot's current value.
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
  },
  addons: {
    packages: new Map(),
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
    features: new Map(),
    meta: {},
  },
  trigger: {
    functions: new Map(),
    triggers: new Map(),
    triggerSources: new Map(),
    meta: {} as TriggerMeta,
    sourceMeta: {},
    webhookSources: new Map(),
    webhookSourceMeta: {},
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
    agentsMeta: {} as AgentsMeta,
    scorers: new Map(),
    scorersMeta: {} as ScorerMeta,
    modelAliases: {},
  },
  gateway: {
    gateways: new Map(),
    meta: {} as GatewaysMeta,
  },
  cli: {
    meta: { programs: {}, renderers: {} },
    programs: {},
  },
  middleware: {
    tagGroup: {},
    httpGroup: {},
    global: [],
  },
  channelMiddleware: {
    tagGroup: {},
  },
  permissions: {
    global: [],
  },
  misc: {
    errors: new Map(),
    schemas: new Map(),
    middleware: {},
    channelMiddleware: {},
    permissions: {},
  },
  package: {
    factories: null,
    singletonServices: null,
    authFactory: null,
    credentialsMeta: null,
    requiredParentServices: null,
    declaredSecrets: null,
  },
})

/**
 * Creates an empty registry for `packageName` if it has none yet; an existing
 * one is left untouched.
 * @internal
 */
export const initializePikkuState = (packageName: string): void => {
  if (!getAllPackageStates().has(packageName)) {
    getAllPackageStates().set(packageName, createEmptyPackageState())
  }
}

/**
 * Discards every package's registry and starts the app's afresh. Registered
 * error classes are carried over, because they come from module side effects
 * that will not run again. Meant for tests.
 */
export const resetPikkuState = () => {
  // Error definitions come from module-import side effects that never re-run.
  const existingErrors = getAllPackageStates().get('__main__')?.misc.errors

  stateHost[PIKKU_STATE_KEY] = new Map<string, PikkuPackageState>()
  initializePikkuState('__main__')

  if (existingErrors) {
    const mainState = getAllPackageStates().get('__main__')!
    mainState.misc.errors = existingErrors
  }
}

if (!getAllPackageStates().has('__main__')) {
  resetPikkuState()
}

/**
 * The app's singleton services, as registered by the generated bootstrap or a
 * runtime adapter.
 * @throws {Error} When none have been registered yet.
 */
export const getSingletonServices = (): CoreSingletonServices => {
  const services = pikkuState(null, 'package', 'singletonServices')
  if (!services) throw new Error('Singleton services not initialized')
  return services
}

/** Registers the app's singleton services, replacing any registered before. */
export const setSingletonServices = (services: CoreSingletonServices): void => {
  pikkuState(null, 'package', 'singletonServices', services)
}

/**
 * The app's registered `createWireServices` factory, if it has one.
 * @internal
 */
export const getCreateWireServices = (): CreateWireServices | undefined => {
  return pikkuState(null, 'package', 'factories')?.createWireServices
}

/**
 * Registers the service factories for a package (an addon), replacing any
 * registered before.
 * @internal
 */
export const addPackageServiceFactories = (
  packageName: string,
  factories: NonNullable<PikkuPackageState['package']['factories']>
): void => {
  pikkuState(packageName, 'package', 'factories', factories)
}

export type { PikkuPackageState } from './types/state.types.js'
