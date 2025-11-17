import { runMiddleware, combineMiddleware } from '../middleware-runner.js'
import { runPermissions } from '../permissions.js'
import { pikkuState } from '../pikku-state.js'
import { coerceTopLevelDataFromSchema, validateSchema } from '../schema.js'
import {
  CoreServices,
  CoreUserSession,
  CorePikkuMiddleware,
  PikkuWiringTypes,
  CoreSingletonServices,
  PikkuInteraction,
  MiddlewareMetadata,
  PermissionMetadata,
} from '../types/core.types.js'
import {
  CorePermissionGroup,
  CorePikkuFunctionConfig,
  CorePikkuPermission,
} from './functions.types.js'
import { UserSessionService } from '../services/user-session-service.js'
import { ForbiddenError } from '../errors/errors.js'

export const addFunction = (
  funcName: string,
  funcConfig: CorePikkuFunctionConfig<any, any>
) => {
  pikkuState('function', 'functions').set(funcName, funcConfig)
}

export const runPikkuFuncDirectly = async <In, Out>(
  funcName: string,
  allServices: CoreServices,
  interaction: PikkuInteraction,
  data: In,
  userSession?: UserSessionService<CoreUserSession>
) => {
  const funcConfig = pikkuState('function', 'functions').get(funcName)
  if (!funcConfig) {
    throw new Error(`Function not found: ${funcName}`)
  }
  // Inject session into interaction
  const interactionWithSession = {
    ...interaction,
    session: userSession,
  }
  return (await funcConfig.func(
    allServices,
    data,
    interactionWithSession
  )) as Out
}

export const runPikkuFunc = async <In = any, Out = any>(
  wireType: PikkuWiringTypes,
  wireId: string,
  funcName: string,
  {
    getAllServices,
    singletonServices,
    data,
    userSession,
    auth: wiringAuth,
    inheritedMiddleware,
    wireMiddleware,
    inheritedPermissions,
    wirePermissions,
    coerceDataFromSchema,
    tags = [],
    interaction,
  }: {
    singletonServices: CoreSingletonServices
    getAllServices: (
      session?: CoreUserSession
    ) => Promise<CoreServices> | CoreServices
    userSession?: UserSessionService<CoreUserSession>
    data: () => Promise<In> | In
    auth?: boolean
    inheritedMiddleware?: MiddlewareMetadata[]
    wireMiddleware?: CorePikkuMiddleware[]
    inheritedPermissions?: PermissionMetadata[]
    wirePermissions?: CorePermissionGroup | CorePikkuPermission[]
    coerceDataFromSchema?: boolean
    tags?: string[]
    interaction: PikkuInteraction
  }
): Promise<Out> => {
  const funcConfig = pikkuState('function', 'functions').get(funcName)
  if (!funcConfig) {
    throw new Error(`Function not found: ${funcName}`)
  }
  const funcMeta = pikkuState('function', 'meta')[funcName]
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
    const session = await userSession?.get()
    if (wiringAuth === true || funcConfig.auth === true) {
      // This means it was explicitly enabled in either wiring or function and has to be respected
      if (!session) {
        throw new ForbiddenError('Authentication required')
      }
    }
    if (wiringAuth === undefined && funcConfig.auth === undefined) {
      // We always default to requiring auth unless explicitly disabled
      if (!session) {
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

    const allServices = await getAllServices(session)

    // Inject session into interaction
    const interactionWithSession = {
      ...interaction,
      session: userSession,
    }

    // Run permissions check with combined permissions: inheritedPermissions (including tags) → wirePermissions → funcPermissions
    await runPermissions(wireType, wireId, {
      wireInheritedPermissions: mergedInheritedPermissions,
      wirePermissions: wirePermissions,
      funcInheritedPermissions: funcMeta.permissions,
      funcPermissions: funcConfig.permissions,
      allServices,
      interaction: interactionWithSession as any, // Permissions shouldn't know about interaction types
      data: actualData,
    })

    return await funcConfig.func(
      allServices,
      actualData,
      interactionWithSession
    )
  }

  // Combine all middleware: inheritedMiddleware → wireMiddleware → funcMiddleware
  const allMiddleware = combineMiddleware(wireType, wireId, {
    wireInheritedMiddleware: inheritedMiddleware,
    wireMiddleware,
    funcInheritedMiddleware: funcMeta.middleware,
    funcMiddleware: funcConfig.middleware,
  })

  if (allMiddleware.length > 0) {
    // Inject session into interaction for middleware
    const interactionWithSession = {
      ...interaction,
      session: userSession,
    }
    return (await runMiddleware<CorePikkuMiddleware>(
      singletonServices,
      interactionWithSession,
      allMiddleware,
      executeFunction
    )) as Out
  }

  return (await executeFunction()) as Out
}
