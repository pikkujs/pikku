import { runMiddleware, combineMiddleware } from '../middleware-runner.js'
import {
  combineChannelMiddleware,
  wrapChannelWithMiddleware,
} from '../wirings/channel/channel-middleware-runner.js'
import { runPermissions } from '../permissions.js'
import { pikkuState } from '../pikku-state.js'
import { coerceTopLevelDataFromSchema, validateSchema } from '../schema.js'
import type {
  CoreUserSession,
  CorePikkuMiddleware,
  PikkuWiringTypes,
  PikkuWire,
  PikkuRawWire,
  MiddlewareMetadata,
  PermissionMetadata,
  CoreSingletonServices,
  CreateWireServices,
  CoreConfig,
} from '../types/core.types.js'
import type { CorePikkuChannelMiddleware } from '../wirings/channel/channel.types.js'
import type {
  CorePermissionGroup,
  CorePikkuFunctionConfig,
  CorePikkuPermission,
} from './functions.types.js'
import { parseVersionedId } from '../version.js'
import type { SessionService } from '../services/user-session-service.js'
import { PikkuSessionService } from '../services/user-session-service.js'
import { ForbiddenError, ReadonlySessionError } from '../errors/errors.js'
import {
  PikkuCredentialWireService,
  createWireServicesCredentialWireProps,
} from '../services/credential-wire-service.js'
import { defaultPikkuUserIdResolver } from '../services/pikku-user-id.js'
import {
  createInvocationAudit,
  resolveAuditConfig,
  type AuditLog,
} from '../services/audit-service.js'
import { rpcService } from '../wirings/rpc/rpc-runner.js'
import { closeWireServices } from '../utils.js'
import type { SecretService } from '../services/secret-service.js'
import type { VariablesService } from '../services/variables-service.js'

/**
 * A single wired addon instance: a namespace (wireAddon `name`) plus the
 * per-instance name-aliases that remap the logical names the addon reads to
 * the actual project secret/variable/credential names.
 */
export type AddonInstance = {
  namespace: string
  secretOverrides?: Record<string, string>
  variableOverrides?: Record<string, string>
  credentialOverrides?: Record<string, string>
}

/**
 * Wrap a SecretService so that the logical secret names an addon reads are
 * remapped to the actual project secret names via the instance's overrides.
 */
const aliasSecretService = (
  secrets: SecretService,
  overrides: Record<string, string>
): SecretService => {
  const map = (key: string) => overrides[key] ?? key
  return {
    getSecret: <T = string>(key: string) => secrets.getSecret<T>(map(key)),
    hasSecret: (key: string) => secrets.hasSecret(map(key)),
    setSecret: (key: string, value: unknown) =>
      secrets.setSecret(map(key), value),
    deleteSecret: (key: string) => secrets.deleteSecret(map(key)),
    getSecrets: async (keys) => {
      const result = await secrets.getSecrets(keys.map(map))
      const out: Record<string, unknown> = {}
      for (const logical of keys) {
        const real = map(logical)
        if (real in result)
          out[logical] = (result as Record<string, unknown>)[real]
      }
      return out as never
    },
  }
}

/**
 * Wrap a VariablesService so that the logical variable names an addon reads
 * are remapped to the actual project variable names via the instance's overrides.
 */
const aliasVariablesService = (
  variables: VariablesService,
  overrides: Record<string, string>
): VariablesService => {
  const map = (name: string) => overrides[name] ?? name
  return {
    get: <T = string>(name: string) => variables.get<T>(map(name)),
    getVariables: (names) => {
      const result = variables.getVariables(names.map(map) as never)
      const remap = (r: Record<string, unknown>) => {
        const out: Record<string, unknown> = {}
        for (const logical of names) {
          const real = map(logical)
          if (real in r) out[logical] = r[real]
        }
        return out
      }
      return result instanceof Promise
        ? (result.then(remap) as never)
        : (remap(result as Record<string, unknown>) as never)
    },
    getAll: () => variables.getAll(),
    set: (name: string, value: unknown) => variables.set(map(name), value),
    has: (name: string) => variables.has(map(name)),
    delete: (name: string) => variables.delete(map(name)),
  }
}

async function resolveSession(
  wire: PikkuRawWire,
  singletonServices: CoreSingletonServices,
  sessionService?: SessionService<CoreUserSession>
): Promise<void> {
  const pikkuUserId = defaultPikkuUserIdResolver(wire)
  if (pikkuUserId) {
    wire.pikkuUserId = pikkuUserId
    if (sessionService instanceof PikkuSessionService) {
      sessionService.setPikkuUserId(pikkuUserId)
    }
  }

  const { sessionStore } = singletonServices
  if (!sessionStore || !pikkuUserId) return

  if (!wire.session) {
    const stored = await sessionStore.get(pikkuUserId)
    if (stored) {
      wire.session = stored
      sessionService?.setInitial(stored)
    }
  } else {
    // Session already present on wire (e.g. propagated from parent workflow).
    // Seed the sessionService so freezeInitial() returns it instead of undefined.
    sessionService?.setInitial(wire.session as CoreUserSession)
  }
}

/**
 * Get or create singleton services for an addon package.
 * Services are cached in pikkuState to avoid recreation on each call.
 *
 * @param packageName - The addon package name
 * @param parentServices - The parent/caller's singleton services (used as base)
 * @returns The package's singleton services
 */
/**
 * Find the consumer-defined namespace (from wireAddon) for a given addon package.
 * Returns null if the package isn't registered as an addon.
 */
const findAddonNamespaceForPackage = (packageName: string): string | null => {
  const addons = pikkuState(null, 'addons', 'packages')
  if (!addons) return null
  for (const [namespace, cfg] of addons.entries()) {
    if (cfg?.package === packageName) return namespace
  }
  return null
}

/**
 * Wrap a workflow service so that bare workflow names passed from inside an
 * addon function are auto-prefixed with the addon's consumer-facing namespace.
 * Without this, `runToCompletion('myWorkflow')` from inside an addon misses
 * the workflow registered under the addon's package scope and throws
 * WorkflowNotFoundError — forcing addons to hardcode their consumer-defined
 * namespace, which couples the addon to its caller.
 *
 * Explicit `'ns:name'` and bare names that already exist in root meta are
 * unaffected; only bare names that would otherwise miss resolution get
 * prefixed.
 */
const wrapWorkflowServiceForPackage = <T extends object>(
  service: T,
  packageName: string,
  namespace: string | null
): T => {
  return new Proxy(service, {
    get(target, prop, receiver) {
      if (prop === 'startWorkflow' || prop === 'runToCompletion') {
        const original = Reflect.get(target, prop, receiver) as Function
        return function (this: any, name: string, ...rest: any[]) {
          if (typeof name === 'string' && !name.includes(':')) {
            // Prefer the known instance namespace; fall back to the
            // package's sole namespace when invoked without an instance.
            const ns = namespace ?? findAddonNamespaceForPackage(packageName)
            if (ns) {
              name = `${ns}:${name}`
            }
          }
          return original.call(this, name, ...rest)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}

const getOrCreatePackageSingletonServices = async (
  packageName: string,
  parentServices: CoreSingletonServices,
  addonInstance?: AddonInstance
): Promise<CoreSingletonServices> => {
  // Singletons are cached per addon INSTANCE (namespace), not per package, so
  // two wireAddon() instances of the same package each get their own services
  // built with their own secret/variable overrides. Namespaces are globally
  // unique, so keying the cache slot by namespace is unambiguous; a bare
  // package-scoped call (no instance) falls back to per-package caching.
  const cacheKey = addonInstance?.namespace ?? packageName

  // Check if we already have cached singleton services for this instance
  const cachedServices = pikkuState(cacheKey, 'package', 'singletonServices')
  if (cachedServices) {
    return cachedServices
  }

  // Get the package's service factories
  const factories = pikkuState(packageName, 'package', 'factories')
  if (!factories || !factories.createSingletonServices) {
    // No factories registered, use parent services
    return parentServices
  }

  // Apply this instance's secret/variable overrides by aliasing the resolver
  // services the addon reads from, so its createSingletonServices resolves
  // instance-specific secrets/variables.
  let existingServices = parentServices
  if (addonInstance?.secretOverrides && parentServices.secrets) {
    existingServices = {
      ...existingServices,
      secrets: aliasSecretService(
        parentServices.secrets,
        addonInstance.secretOverrides
      ),
    }
  }
  if (addonInstance?.variableOverrides && parentServices.variables) {
    existingServices = {
      ...existingServices,
      variables: aliasVariablesService(
        parentServices.variables,
        addonInstance.variableOverrides
      ),
    }
  }

  // Create config for the package (use parent config if no factory)
  let config: CoreConfig = existingServices.config
  if (factories.createConfig) {
    config = await factories.createConfig(existingServices.variables)
  }

  // Create singleton services for the package, passing parent services as existing
  const packageServices = await factories.createSingletonServices(
    config,
    existingServices
  )

  // Wrap workflowService so that bare names used inside the addon's functions
  // resolve to workflows registered under the addon's package scope.
  if (
    packageServices.workflowService &&
    typeof packageServices.workflowService === 'object'
  ) {
    packageServices.workflowService = wrapWorkflowServiceForPackage(
      packageServices.workflowService as object,
      packageName,
      addonInstance?.namespace ?? null
    ) as typeof packageServices.workflowService
  }

  // Cache the services
  pikkuState(cacheKey, 'package', 'singletonServices', packageServices)

  return packageServices
}

export const addFunction = (
  funcName: string,
  funcConfig: CorePikkuFunctionConfig<any, any>,
  packageName: string | null = null
) => {
  pikkuState(packageName, 'function', 'functions').set(funcName, funcConfig)
}

export const getFunctionNames = (
  packageName: string | null = null
): string[] => {
  const functionsMeta = pikkuState(packageName, 'function', 'meta')
  return Object.keys(functionsMeta)
}

export const getAllFunctionNames = (): string[] => {
  const functions: string[] = []

  const mainFunctionsMeta = pikkuState(null, 'function', 'meta')
  functions.push(...Object.keys(mainFunctionsMeta))

  const addons = pikkuState(null, 'addons', 'packages')
  for (const [namespace, config] of addons) {
    const packageFunctionsMeta = pikkuState(config.package, 'function', 'meta')
    for (const funcName of Object.keys(packageFunctionsMeta)) {
      functions.push(`${namespace}:${funcName}`)
    }
  }

  return functions
}

export const runPikkuFunc = async <In = any, Out = any>(
  wireType: PikkuWiringTypes,
  wireId: string,
  funcName: string,
  {
    singletonServices,
    createWireServices,
    data,
    auth: wiringAuth,
    inheritedMiddleware,
    wireMiddleware,
    inheritedChannelMiddleware,
    wireChannelMiddleware,
    inheritedPermissions,
    wirePermissions,
    coerceDataFromSchema,
    tags = [],
    wire,
    sessionService,
    credentialWireService,
    packageName = null,
    addonInstance,
  }: {
    singletonServices: CoreSingletonServices
    createWireServices?: CreateWireServices
    data: () => Promise<In> | In
    auth?: boolean
    inheritedMiddleware?: MiddlewareMetadata[]
    wireMiddleware?: CorePikkuMiddleware[]
    inheritedChannelMiddleware?: MiddlewareMetadata[]
    wireChannelMiddleware?: CorePikkuChannelMiddleware[]
    inheritedPermissions?: PermissionMetadata[]
    wirePermissions?: CorePermissionGroup | CorePikkuPermission[]
    coerceDataFromSchema?: boolean
    tags?: string[]
    wire: PikkuRawWire
    sessionService?: SessionService<CoreUserSession>
    credentialWireService?: PikkuCredentialWireService
    packageName?: string | null
    addonInstance?: AddonInstance
  }
): Promise<Out> => {
  wire.wireType ??= wireType
  wire.wireId ??= wireId

  const funcMap = pikkuState(packageName, 'function', 'functions')
  let funcConfig = funcMap.get(funcName)
  const allMeta = pikkuState(packageName, 'function', 'meta')
  let funcMeta = allMeta[funcName]

  if (!funcConfig || !funcMeta) {
    const { baseName, version } = parseVersionedId(funcName)
    if (version !== null) {
      funcConfig = funcConfig || funcMap.get(baseName)
      funcMeta = funcMeta || allMeta[baseName]
      if (funcConfig && funcMeta) {
        singletonServices.logger.warn(
          `Version '${funcName}' not registered, resolved to '${baseName}'`
        )
      }
    }
  }

  if (!funcConfig) {
    throw new Error(`Function not found: ${funcName}`)
  }
  if (!funcMeta) {
    throw new Error(`Function meta not found: ${funcName}`)
  }

  const resolvedFunctionId = funcMeta.pikkuFuncId ?? funcName

  // For addon packages, get or create their singleton services
  const resolvedSingletonServices = packageName
    ? await getOrCreatePackageSingletonServices(
        packageName,
        singletonServices,
        addonInstance
      )
    : singletonServices

  // Get the package's createWireServices if available
  let resolvedCreateWireServices = createWireServices
  if (packageName) {
    const factories = pikkuState(packageName, 'package', 'factories')
    if (factories?.createWireServices) {
      resolvedCreateWireServices = factories.createWireServices
    }
  }

  const allChannelMiddleware = combineChannelMiddleware(wireType, wireId, {
    wireInheritedChannelMiddleware: inheritedChannelMiddleware,
    wireChannelMiddleware,
    packageName,
  })

  const resolvedWire =
    allChannelMiddleware.length > 0 && wire.channel
      ? wrapChannelWithMiddleware(
          wire,
          resolvedSingletonServices,
          allChannelMiddleware
        )
      : wire

  // Set up credential wire service early so middleware can use setCredential.
  // An addon instance with credentialOverrides always gets a fresh alias-aware
  // service so its logical credential names resolve to instance-specific ones,
  // even when a parent credential service is already present on the wire.
  // Otherwise skip if already set up (e.g. addon functions reuse the parent wire).
  if (addonInstance?.credentialOverrides) {
    // Credentials belong to the consuming project, so resolve them via the
    // project's credentialService (the addon's own singletons may not carry it).
    const aliasedCredentialWireService = new PikkuCredentialWireService(
      singletonServices.credentialService ??
        resolvedSingletonServices.credentialService,
      resolvedWire,
      addonInstance.credentialOverrides
    )
    Object.assign(
      resolvedWire,
      createWireServicesCredentialWireProps(aliasedCredentialWireService)
    )
  } else if (!resolvedWire.getCredentials) {
    const resolvedCredentialWireService =
      credentialWireService ??
      new PikkuCredentialWireService(
        resolvedSingletonServices.credentialService,
        resolvedWire
      )
    Object.assign(
      resolvedWire,
      createWireServicesCredentialWireProps(resolvedCredentialWireService)
    )
  }

  const resolvedAuditConfig = resolveAuditConfig(funcConfig.audit)
  const invocationWire = resolvedWire as PikkuWire
  const previousFunctionId = invocationWire.functionId
  const previousAudit = invocationWire.audit
  const previousAddonNamespace = invocationWire.addonNamespace
  const previousRpcDescriptor = Object.getOwnPropertyDescriptor(
    invocationWire,
    'rpc'
  )
  invocationWire.functionId = resolvedFunctionId
  invocationWire.audit = resolvedAuditConfig
  // Track which addon instance is executing so intra-addon sibling calls
  // resolve the same per-instance singleton services and overrides.
  if (addonInstance) {
    invocationWire.addonNamespace = addonInstance.namespace
  }

  // Convert tags to PermissionMetadata and merge with inheritedPermissions
  let mergedInheritedPermissions: PermissionMetadata[]
  if (tags && tags.length > 0) {
    mergedInheritedPermissions = [
      ...(inheritedPermissions || []),
      ...tags.map((tag) => ({ type: 'tag' as const, tag })),
    ]
  } else {
    mergedInheritedPermissions = inheritedPermissions || []
  }

  // Helper function to run permissions and execute the function
  const executeFunction = async () => {
    await resolveSession(
      invocationWire,
      resolvedSingletonServices,
      sessionService
    )

    if (sessionService) {
      invocationWire.session = sessionService.freezeInitial()
      invocationWire.setSession = (s: any) => sessionService.set(s)
      invocationWire.clearSession = () => sessionService.clear()
      invocationWire.getSession = () => sessionService.get()
      invocationWire.hasSessionChanged = () => sessionService.sessionChanged
    }

    const session = invocationWire.session

    if (funcMeta.sessionless) {
      if (wiringAuth === true || funcConfig.auth === true) {
        if (!session) {
          throw new ForbiddenError('Authentication required')
        }
      }
    } else {
      if (wiringAuth === false || funcConfig.auth === false) {
        resolvedSingletonServices.logger.warn(
          `Function '${funcName}' requires a session but auth was explicitly disabled — use pikkuSessionlessFunc instead.`
        )
      }
      if (!session) {
        throw new ForbiddenError('Authentication required')
      }
    }

    if ((session as any)?.readonly && !funcMeta.readonly) {
      throw new ReadonlySessionError()
    }

    // Evaluate the data from the lazy function
    const actualData = await data()

    // Validate and coerce data if schema is defined
    const inputSchemaName = funcMeta.inputSchemaName
    if (inputSchemaName) {
      // Coerce (top level) data types before validation (e.g. string→array, string→date)
      if (coerceDataFromSchema) {
        coerceTopLevelDataFromSchema(inputSchemaName, actualData, packageName)
      }
      // Validate request data against the defined schema, if any
      await validateSchema(
        resolvedSingletonServices.logger,
        resolvedSingletonServices.schema,
        inputSchemaName,
        actualData,
        packageName
      )
    }

    if (
      mergedInheritedPermissions.length > 0 ||
      wirePermissions ||
      funcMeta.permissions ||
      funcConfig.permissions
    ) {
      await runPermissions(wireType, wireId, {
        wireInheritedPermissions: mergedInheritedPermissions,
        wirePermissions: wirePermissions,
        funcInheritedPermissions: funcMeta.permissions,
        funcPermissions: funcConfig.permissions,
        services: resolvedSingletonServices,
        wire: invocationWire as any,
        data: actualData,
        packageName,
      })
    }

    let wireServices: Record<string, unknown> | undefined
    let invocationAuditLog: AuditLog | undefined
    try {
      wireServices = (await resolvedCreateWireServices?.(
        resolvedSingletonServices,
        invocationWire
      )) as Record<string, unknown> | undefined
      let services =
        wireServices && Object.keys(wireServices).length > 0
          ? { ...resolvedSingletonServices, ...wireServices }
          : resolvedSingletonServices
      // The audit gate is per-function, but the auditLog wire service is
      // created per-transport-invocation — a nested/exposed-RPC call would
      // otherwise inherit an auditLog constructed while the OUTER wire's
      // audit was unset (e.g. the generated rpcCaller has no audit config),
      // silently dropping every write. Re-gate here: if this function
      // declares audit and the inherited auditLog wasn't built for this
      // invocation (config identity check), bind a fresh one to this wire.
      if (
        resolvedAuditConfig &&
        resolvedSingletonServices.audit &&
        services.auditLog?.config !== resolvedAuditConfig
      ) {
        invocationAuditLog = createInvocationAudit(
          resolvedSingletonServices.audit,
          invocationWire,
          resolvedSingletonServices.logger
        )
        services = { ...services, auditLog: invocationAuditLog }
      }
      const callerPackageName = packageName
      Object.defineProperty(invocationWire, 'rpc', {
        get() {
          const rpc = rpcService.getContextRPCService(
            services,
            invocationWire,
            { sessionService },
            0,
            callerPackageName
          )
          Object.defineProperty(invocationWire, 'rpc', {
            value: rpc,
            writable: true,
            configurable: true,
          })
          return rpc
        },
        configurable: true,
        enumerable: true,
      })
      return await funcConfig.func(services, actualData, invocationWire)
    } finally {
      // Flush the runner-installed audit buffer before wire services close.
      await invocationAuditLog?.close()
      if (wireServices && Object.keys(wireServices).length > 0) {
        await closeWireServices(resolvedSingletonServices.logger, wireServices)
      }
    }
  }

  const allMiddleware = combineMiddleware(wireType, wireId, {
    wireInheritedMiddleware: inheritedMiddleware,
    wireMiddleware,
    funcInheritedMiddleware: funcMeta.middleware,
    funcMiddleware: funcConfig.middleware,
    packageName,
  })

  if (allMiddleware.length > 0) {
    try {
      return (await runMiddleware<CorePikkuMiddleware>(
        resolvedSingletonServices,
        invocationWire,
        allMiddleware,
        executeFunction
      )) as Out
    } finally {
      if (previousRpcDescriptor) {
        Object.defineProperty(invocationWire, 'rpc', previousRpcDescriptor)
      }
      if (previousFunctionId === undefined) {
        delete (invocationWire as any).functionId
      } else {
        invocationWire.functionId = previousFunctionId
      }
      if (previousAudit === undefined) {
        delete (invocationWire as any).audit
      } else {
        invocationWire.audit = previousAudit
      }
      if (previousAddonNamespace === undefined) {
        delete (invocationWire as any).addonNamespace
      } else {
        invocationWire.addonNamespace = previousAddonNamespace
      }
    }
  }

  try {
    return (await executeFunction()) as Out
  } finally {
    if (previousRpcDescriptor) {
      Object.defineProperty(invocationWire, 'rpc', previousRpcDescriptor)
    }
    if (previousFunctionId === undefined) {
      delete (invocationWire as any).functionId
    } else {
      invocationWire.functionId = previousFunctionId
    }
    if (previousAudit === undefined) {
      delete (invocationWire as any).audit
    } else {
      invocationWire.audit = previousAudit
    }
  }
}
