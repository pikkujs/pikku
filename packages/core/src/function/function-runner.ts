import { beginChanges } from './abort-scope.js'
import { runMiddleware, combineMiddleware } from '../middleware-runner.js'
import {
  combineChannelMiddleware,
  wrapChannelWithMiddleware,
} from '../wirings/channel/channel-middleware-runner.js'
import { runPermissions, type PermissionWire } from '../permissions.js'
import { withoutSecrets } from '../services/secretless.js'
import { pikkuState } from '../pikku-state.js'
import {
  applyDefaultsFromSchema,
  coerceTopLevelDataFromSchema,
  validateSchema,
} from '../schema.js'
import type {
  CoreUserSession,
  PikkuWiringTypes,
  PikkuWire,
  PikkuRawWire,
  CoreSingletonServices,
  CreateWireServices,
} from '../types/core.types.js'
import type {
  CorePikkuMiddleware,
  MiddlewareMetadata,
} from '../middleware/middleware.types.js'
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
import { getOrCreatePackageSingletonServices } from '../wirings/addon/addon-runner.js'
import {
  resolveAddonAuth,
  resolveAddonFunctionTarget,
  resolveAddonScopes,
  resolveAddonTagMiddleware,
} from '../wirings/addon/wire-addon.js'
import type { AddonInstance } from '../wirings/addon/addon-runner.js'
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

  /**
   * The package the *function* belongs to, which is the wire's own until a
   * `ref()` resolves the target into an addon. The wiring stays the consuming
   * app's — that is what keeps the app's middleware running rather than the
   * addon's — but everything the function is declared with lives in the addon's
   * package state, so its schemas, services and permissions are read from here.
   */
  let funcPackageName = packageName

  if (!funcMeta) {
    const addonTarget = resolveAddonFunctionTarget(funcName, packageName)
    if (addonTarget) {
      funcConfig =
        funcConfig ||
        pikkuState(addonTarget.packageName, 'function', 'functions').get(
          addonTarget.localName
        )
      funcMeta = pikkuState(addonTarget.packageName, 'function', 'meta')[
        addonTarget.localName
      ]
      if (funcMeta) {
        funcPackageName = addonTarget.packageName
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

  const resolvedSingletonServices = funcPackageName
    ? await getOrCreatePackageSingletonServices(
        funcPackageName,
        singletonServices,
        addonInstance
      )
    : singletonServices

  let resolvedCreateWireServices = createWireServices
  if (funcPackageName) {
    const factories = pikkuState(funcPackageName, 'package', 'factories')
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

  // Set up early so middleware can use setCredential. An addon instance with
  // credentialOverrides always gets a fresh alias-aware service, even when a
  // parent credential service is already present on the wire.
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

  // knowledge: decisions/internals/core-function-runner-restores-the-wire-fields-it-overwrites.md
  const restoreInvocationWire = () => {
    if (previousRpcDescriptor) {
      Object.defineProperty(invocationWire, 'rpc', previousRpcDescriptor)
    }
    restoreField('functionId', previousFunctionId)
    restoreField('audit', previousAudit)
    restoreField('addonNamespace', previousAddonNamespace)
  }

  function restoreField<K extends 'functionId' | 'audit' | 'addonNamespace'>(
    key: K,
    previous: PikkuWire[K]
  ) {
    if (previous === undefined) {
      delete invocationWire[key]
    } else {
      invocationWire[key] = previous
    }
  }

  invocationWire.functionId = resolvedFunctionId
  invocationWire.audit = resolvedAuditConfig
  // Track which addon instance is executing so intra-addon sibling calls
  // resolve the same per-instance singleton services and overrides.
  if (addonInstance) {
    invocationWire.addonNamespace = addonInstance.namespace
  }

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
      if (
        wiringAuth === true ||
        funcConfig.auth === true ||
        resolveAddonAuth(packageName, addonInstance?.namespace)
      ) {
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

    if (session?.readonly && !funcMeta.readonly) {
      throw new ReadonlySessionError()
    }

    // Only mutating functions get a checkpoint. A read has nothing to declare,
    // and offering it there would invite the contradiction of a `readonly`
    // function announcing where its changes begin.
    if (!funcMeta.readonly) {
      invocationWire.beginChanges = beginChanges
    }

    // knowledge: decisions/security/addon-scopes-are-resolved-where-the-function-runs.md
    const addonScopes = resolveAddonScopes(
      packageName,
      addonInstance?.namespace
    )
    const functionScopes = funcConfig.scopes ?? funcMeta.scopes
    verifyScopes(
      addonScopes.length > 0
        ? [...addonScopes, ...(functionScopes ?? [])]
        : functionScopes,
      session
    )

    let actualData = await data()

    const inputSchemaName = funcMeta.inputSchemaName
    if (inputSchemaName) {
      actualData = applyDefaultsFromSchema(
        inputSchemaName,
        actualData,
        funcPackageName
      )
      if (coerceDataFromSchema) {
        coerceTopLevelDataFromSchema(
          inputSchemaName,
          actualData,
          funcPackageName
        )
      }
      await validateSchema(
        resolvedSingletonServices.logger,
        resolvedSingletonServices.schema,
        inputSchemaName,
        actualData,
        funcPackageName
      )
    }

    await runPermissions({
      funcPermissions: funcConfig.permissions,
      services: withoutSecrets(
        resolvedSingletonServices,
        'a permission'
      ) as CoreSingletonServices,
      // knowledge: decisions/security/a-permission-gets-a-wire-it-cannot-reply-on.md
      wire: invocationWire as PermissionWire,
      data: actualData,
      packageName: funcPackageName,
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
      // knowledge: decisions/internals/core-function-runner-restores-the-wire-fields-it-overwrites.md
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
      const callerPackageName = funcPackageName
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
      return await funcConfig.func(
        withoutSecrets(services, 'a pikku function'),
        actualData,
        invocationWire
      )
    } finally {
      // Flush the runner-installed audit buffer before wire services close.
      await invocationAuditLog?.close()
      if (wireServices && Object.keys(wireServices).length > 0) {
        await closeWireServices(resolvedSingletonServices.logger, wireServices)
      }
    }
  }

  const addonTagMiddleware = resolveAddonTagMiddleware(
    packageName,
    addonInstance?.namespace
  )

  const allMiddleware = combineMiddleware(wireType, wireId, {
    wireInheritedMiddleware: inheritedMiddleware,
    wireMiddleware:
      addonTagMiddleware.length > 0
        ? [...addonTagMiddleware, ...(wireMiddleware ?? [])]
        : wireMiddleware,
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
      restoreInvocationWire()
    }
  }

  try {
    return (await executeFunction()) as Out
  } finally {
    restoreInvocationWire()
  }
}
