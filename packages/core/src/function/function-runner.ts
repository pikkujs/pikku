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
} from '../types/core.types.js'
import {
  CorePermissionGroup,
  CorePikkuFunctionConfig,
  CorePikkuPermission,
} from './functions.types.js'
import { SessionService } from '../services/user-session-service.js'
import { ForbiddenError } from '../errors/errors.js'
import { rpcService } from '../wirings/rpc/rpc-runner.js'
import { closeWireServices } from '../utils.js'

export const addFunction = (
  funcName: string,
  funcConfig: CorePikkuFunctionConfig<any, any>,
  packageName: string | null = null
) => {
  pikkuState(packageName, 'function', 'functions').set(funcName, funcConfig)
}

export const runPikkuFuncDirectly = async <In, Out>(
  funcName: string,
  allServices: CoreServices,
  wire: PikkuWire,
  data: In,
  userSession?: SessionService<CoreUserSession>
) => {
  const funcConfig = pikkuState(null, 'function', 'functions').get(funcName)
  if (!funcConfig) {
    throw new Error(`Function not found: ${funcName}`)
  }
  // Inject session into wire
  const wireWithSession = {
    ...wire,
    session: userSession,
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
    packageName = '',
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
    packageName?: string | null
  }
): Promise<Out> => {
  const funcConfig = pikkuState(packageName, 'function', 'functions').get(
    funcName
  )
  if (!funcConfig) {
    throw new Error(`Function not found: ${funcName}`)
  }
  const funcMeta = pikkuState(packageName, 'function', 'meta')[funcName]
  if (!funcMeta) {
    throw new Error(`Function meta not found: ${funcName}`)
  }

  // Convert tags to PermissionMetadata and merge with inheritedPermissions
  const mergedInheritedPermissions: PermissionMetadata[] = [
    ...(inheritedPermissions || []),
    ...(tags?.map((tag) => ({ type: 'tag' as const, tag })) || []),
  ]

  // Helper function to run permissions and execute the function
  const executeFunction = async () => {
    const initialSession = wire.session?.freezeInitial()

    const wireWithInitialSession: PikkuWire = {
      ...wire,
      initialSession,
    }

    if (wiringAuth === true || funcConfig.auth === true) {
      // This means it was explicitly enabled in either wiring or function and has to be respected
      if (!initialSession) {
        throw new ForbiddenError('Authentication required')
      }
    }
    if (wiringAuth === undefined && funcConfig.auth === undefined) {
      // We always default to requiring auth unless explicitly disabled
      if (!initialSession) {
        // TODO: Critical, we need to figure out how to make this work with different wirings
        // throw new ForbiddenError('Authentication required')
      }
    }

    // Evaluate the data from the lazy function
    const actualData = await data()

    // Validate and coerce data if schema is defined
    const inputSchemaName = funcMeta.inputSchemaName
    if (inputSchemaName) {
      // Validate request data against the defined schema, if any
      await validateSchema(
        singletonServices.logger,
        singletonServices.schema,
        inputSchemaName,
        actualData
      )
      // Coerce (top level) query string parameters or date objects if specified by the schema
      if (coerceDataFromSchema) {
        coerceTopLevelDataFromSchema(inputSchemaName, actualData)
      }
    }

    await runPermissions(wireType, wireId, {
      wireInheritedPermissions: mergedInheritedPermissions,
      wirePermissions: wirePermissions,
      funcInheritedPermissions: funcMeta.permissions,
      funcPermissions: funcConfig.permissions,
      services: singletonServices,
      wire: { ...wireWithInitialSession, rpc: undefined } as any,
      data: actualData,
    })

    const wireServices = await createWireServices?.(
      singletonServices,
      wireWithInitialSession
    )
    try {
      const services = { ...singletonServices, ...wireServices }
      const rpc = rpcService.getContextRPCService(
        services,
        wireWithInitialSession
      )
      return await funcConfig.func(services, actualData, {
        ...wireWithInitialSession,
        rpc,
      })
    } finally {
      if (wireServices) {
        await closeWireServices(singletonServices.logger, wireServices)
      }
    }
  }

  const allMiddleware = combineMiddleware(wireType, wireId, {
    wireInheritedMiddleware: inheritedMiddleware,
    wireMiddleware,
    funcInheritedMiddleware: funcMeta.middleware,
    funcMiddleware: funcConfig.middleware,
  })

  if (allMiddleware.length > 0) {
    return (await runMiddleware<CorePikkuMiddleware>(
      singletonServices,
      wire,
      allMiddleware,
      executeFunction
    )) as Out
  }

  return (await executeFunction()) as Out
}
