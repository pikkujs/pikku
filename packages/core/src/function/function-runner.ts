import { runMiddleware, combineMiddleware } from '../middleware-runner.js'
import {
  combineChannelMiddleware,
  wrapChannelWithMiddleware,
} from '../wirings/channel/channel-middleware-runner.js'
import { runPermissions } from '../permissions.js'
import { pikkuState } from '../pikku-state.js'
import { coerceTopLevelDataFromSchema, validateSchema } from '../schema.js'
import {
  CoreServices,
  CoreUserSession,
  CorePikkuMiddleware,
  PikkuWiringTypes,
  PikkuWire,
  MiddlewareMetadata,
  PermissionMetadata,
  CoreSingletonServices,
  CreateWireServices,
  CoreConfig,
} from '../types/core.types.js'
import type { CorePikkuChannelMiddleware } from '../wirings/channel/channel.types.js'
import {
  CorePermissionGroup,
  CorePikkuFunctionConfig,
  CorePikkuPermission,
} from './functions.types.js'
import { parseVersionedId } from '../version.js'
import {
  SessionService,
  createFunctionSessionWireProps,
} from '../services/user-session-service.js'
import { ForbiddenError } from '../errors/errors.js'
import { rpcService } from '../wirings/rpc/rpc-runner.js'
import { closeWireServices } from '../utils.js'

/**
 * Get or create singleton services for an external package.
 * Services are cached in pikkuState to avoid recreation on each call.
 *
 * @param packageName - The external package name
 * @param parentServices - The parent/caller's singleton services (used as base)
 * @returns The package's singleton services
 */
const getOrCreatePackageSingletonServices = async (
  packageName: string,
  parentServices: CoreSingletonServices
): Promise<CoreSingletonServices> => {
  // Check if we already have cached singleton services for this package
  const cachedServices = pikkuState(packageName, 'package', 'singletonServices')
  if (cachedServices) {
    return cachedServices
  }

  // Get the package's service factories
  const factories = pikkuState(packageName, 'package', 'factories')
  if (!factories || !factories.createSingletonServices) {
    // No factories registered, use parent services
    return parentServices
  }

  // Create config for the package (use parent config if no factory)
  let config: CoreConfig = parentServices.config
  if (factories.createConfig) {
    config = await factories.createConfig(parentServices.variables)
  }

  // Create singleton services for the package, passing parent services as existing
  const packageServices = await factories.createSingletonServices(
    config,
    parentServices
  )

  // Cache the services
  pikkuState(packageName, 'package', 'singletonServices', packageServices)

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

  const addons = pikkuState(null, 'rpc', 'addons')
  for (const [namespace, config] of addons) {
    const packageFunctionsMeta = pikkuState(config.package, 'function', 'meta')
    for (const funcName of Object.keys(packageFunctionsMeta)) {
      functions.push(`${namespace}:${funcName}`)
    }
  }

  return functions
}

export const runPikkuFuncDirectly = async <In, Out>(
  funcName: string,
  allServices: CoreServices,
  wire: PikkuWire,
  data: In,
  userSession?: SessionService<CoreUserSession>,
  packageName: string | null = null
) => {
  const funcConfig = pikkuState(packageName, 'function', 'functions').get(
    funcName
  )
  if (!funcConfig) {
    throw new Error(`Function not found: ${funcName}`)
  }
  const wireWithSession = {
    ...wire,
    ...(userSession && createFunctionSessionWireProps(userSession)),
  }
  return (await funcConfig.func(allServices, data, wireWithSession)) as Out
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
    packageName = null,
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
    wire: PikkuWire
    sessionService?: SessionService<CoreUserSession>
    packageName?: string | null
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

  // For external packages, get or create their singleton services
  const resolvedSingletonServices = packageName
    ? await getOrCreatePackageSingletonServices(packageName, singletonServices)
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
    if (sessionService) {
      resolvedWire.session = sessionService.freezeInitial()
      resolvedWire.setSession = (s: any) => sessionService.set(s)
      resolvedWire.clearSession = () => sessionService.clear()
      resolvedWire.getSession = () => sessionService.get()
      resolvedWire.hasSessionChanged = () => sessionService.sessionChanged
    }

    const session = resolvedWire.session

    if (funcMeta.sessionless) {
      if (wiringAuth === true || funcConfig.auth === true) {
        if (!session) {
          throw new ForbiddenError('Authentication required')
        }
      }
    } else if (funcMeta.sessionless === false) {
      if (wiringAuth === false || funcConfig.auth === false) {
        resolvedSingletonServices.logger.warn(
          `Function '${funcName}' requires a session but auth was explicitly disabled — use pikkuSessionlessFunc instead.`
        )
      }
      if (!session) {
        throw new ForbiddenError('Authentication required')
      }
    } else {
      // TODO: Remove after a couple of releases — backward compat for
      // generated metadata that doesn't include the `sessionless` field yet.
      if (wiringAuth === true || funcConfig.auth === true) {
        if (!session) {
          throw new ForbiddenError('Authentication required')
        }
      }
    }

    // Evaluate the data from the lazy function
    const actualData = await data()

    // Validate and coerce data if schema is defined
    const inputSchemaName = funcMeta.inputSchemaName
    if (inputSchemaName) {
      // Validate request data against the defined schema, if any
      await validateSchema(
        resolvedSingletonServices.logger,
        resolvedSingletonServices.schema,
        inputSchemaName,
        actualData,
        packageName
      )
      // Coerce (top level) query string parameters or date objects if specified by the schema
      if (coerceDataFromSchema) {
        coerceTopLevelDataFromSchema(inputSchemaName, actualData, packageName)
      }
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
        wire: resolvedWire as any,
        data: actualData,
        packageName,
      })
    }

    const wireServices = await resolvedCreateWireServices?.(
      resolvedSingletonServices,
      resolvedWire
    )
    try {
      const services =
        wireServices && Object.keys(wireServices).length > 0
          ? { ...resolvedSingletonServices, ...wireServices }
          : resolvedSingletonServices
      Object.defineProperty(resolvedWire, 'rpc', {
        get() {
          const rpc = rpcService.getContextRPCService(services, resolvedWire, {
            sessionService,
          })
          Object.defineProperty(resolvedWire, 'rpc', {
            value: rpc,
            writable: true,
            configurable: true,
          })
          return rpc
        },
        configurable: true,
        enumerable: true,
      })
      return await funcConfig.func(services, actualData, resolvedWire)
    } finally {
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
    return (await runMiddleware<CorePikkuMiddleware>(
      resolvedSingletonServices,
      resolvedWire,
      allMiddleware,
      executeFunction
    )) as Out
  }

  return (await executeFunction()) as Out
}
