import { runMiddleware, combineMiddleware } from '../middleware-runner.js'
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

  const externalPackages = pikkuState(null, 'rpc', 'externalPackages')
  for (const [namespace, config] of externalPackages) {
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
    inheritedPermissions?: PermissionMetadata[]
    wirePermissions?: CorePermissionGroup | CorePikkuPermission[]
    coerceDataFromSchema?: boolean
    tags?: string[]
    wire: PikkuWire
    sessionService?: SessionService<CoreUserSession>
    packageName?: string | null
  }
): Promise<Out> => {
  const funcMap = pikkuState(packageName, 'function', 'functions')
  let funcConfig = funcMap.get(funcName)
  const allMeta = pikkuState(packageName, 'function', 'meta')
  let funcMeta = allMeta[funcName]

  if (!funcConfig || !funcMeta) {
    const { baseName, version } = parseVersionedId(funcName)
    if (version !== null) {
      funcConfig = funcConfig || funcMap.get(baseName)
      funcMeta = funcMeta || allMeta[baseName]
      if (funcConfig || funcMeta) {
        singletonServices.logger.warn(
          `Version fallback: '${funcName}' not found, resolved to '${baseName}'`
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

  // Convert tags to PermissionMetadata and merge with inheritedPermissions
  const mergedInheritedPermissions: PermissionMetadata[] = [
    ...(inheritedPermissions || []),
    ...(tags?.map((tag) => ({ type: 'tag' as const, tag })) || []),
  ]

  // Helper function to run permissions and execute the function
  const executeFunction = async () => {
    const functionWireProps = sessionService
      ? createFunctionSessionWireProps(sessionService)
      : undefined

    const wireWithSession: PikkuWire = {
      ...wire,
      ...functionWireProps,
    }

    const session = wireWithSession.session

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
      } else if (!session) {
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

    await runPermissions(wireType, wireId, {
      wireInheritedPermissions: mergedInheritedPermissions,
      wirePermissions: wirePermissions,
      funcInheritedPermissions: funcMeta.permissions,
      funcPermissions: funcConfig.permissions,
      services: resolvedSingletonServices,
      wire: { ...wireWithSession, rpc: undefined } as any,
      data: actualData,
      packageName,
    })

    const wireServices = await resolvedCreateWireServices?.(
      resolvedSingletonServices,
      wireWithSession
    )
    try {
      const services = { ...resolvedSingletonServices, ...wireServices }
      const rpc = rpcService.getContextRPCService(services, wireWithSession)
      return await funcConfig.func(services, actualData, {
        ...wireWithSession,
        rpc,
      })
    } finally {
      if (wireServices) {
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
      wire,
      allMiddleware,
      executeFunction
    )) as Out
  }

  return (await executeFunction()) as Out
}
