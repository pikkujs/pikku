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
  CoreSingletonServices,
  CreateWireServices,
} from '../types/core.types.js'
import type { CorePikkuChannelMiddleware } from '../wirings/channel/channel.types.js'
import type { CorePikkuFunctionConfig } from './functions.types.js'
import { parseVersionedId } from '../version.js'
import type { SessionService } from '../services/user-session-service.js'
import { PikkuSessionService } from '../services/user-session-service.js'
import { ForbiddenError, ReadonlySessionError } from '../errors/errors.js'
import { verifyScopes } from '../scopes.js'
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
import { getOrCreatePackageSingletonServices } from '../wirings/rpc/addon-runner.js'
import type { AddonInstance } from '../wirings/rpc/addon-runner.js'
import { closeWireServices } from '../utils.js'

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
    coerceDataFromSchema,
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

    // Scopes gate before the data is evaluated: they depend only on the
    // session, so a denied request never pays to parse or validate its body.
    // Scopes are an AND gate and stay separate from runPermissions, which
    // evaluates the function's own OR-groups against request data.
    verifyScopes(funcConfig.scopes ?? funcMeta.scopes, session)

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

    await runPermissions({
      funcPermissions: funcConfig.permissions,
      services: resolvedSingletonServices,
      wire: invocationWire as any,
      data: actualData,
      packageName,
    })

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
