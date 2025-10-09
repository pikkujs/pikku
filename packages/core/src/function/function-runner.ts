import { ForbiddenError } from '../errors/errors.js'
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
} from '../types/core.types.js'
import {
  CorePermissionGroup,
  CorePikkuFunctionConfig,
} from './functions.types.js'
import { UserSessionService } from '../services/user-session-service.js'

export const addFunction = (
  funcName: string,
  funcConfig: CorePikkuFunctionConfig<any, any>
) => {
  pikkuState('function', 'functions').set(funcName, funcConfig)
}

export const runPikkuFuncDirectly = async <In, Out>(
  funcName: string,
  allServices: CoreServices,
  data: In,
  session?: CoreUserSession
) => {
  const funcConfig = pikkuState('function', 'functions').get(funcName)
  if (!funcConfig) {
    throw new Error(`Function not found: ${funcName}`)
  }
  return (await funcConfig.func(allServices, data, session!)) as Out
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
    permissions: wiringPermissions,
    middleware: wiringMiddleware,
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
    permissions?: CorePermissionGroup
    middleware?: CorePikkuMiddleware[]
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

  // Check authentication
  const inputSchemaName = funcMeta.inputSchemaName
  if (inputSchemaName) {
    // Validate request data against the defined schema, if any
    await validateSchema(
      singletonServices.logger,
      singletonServices.schema,
      inputSchemaName,
      data
    )
    // Coerce (top level) query string parameters or date objects if specified by the schema
    if (coerceDataFromSchema) {
      coerceTopLevelDataFromSchema(inputSchemaName, data)
    }
  }

  // Combine all middleware: wiring tags → wiring middleware → func middleware → func tags
  const allMiddleware = combineMiddleware(wireType, wireId, {
    wiringTags: tags,
    wiringMiddleware,
    funcMiddleware: funcConfig.middleware,
    funcTags: funcConfig.tags,
  })

  if (allMiddleware.length > 0) {
    return (await runMiddleware<CorePikkuMiddleware>(
      {
        ...singletonServices,
        userSession,
      },
      interaction,
      allMiddleware,
      async () => {
        const session = userSession?.get()
        if (!session) {
          if (wiringAuth === false || funcConfig.auth === false) {
            throw new ForbiddenError()
          }
        }
        const allServices = await getAllServices(session)
        await runPermissions(wireType, wireId, {
          wiringTags: tags,
          wiringPermissions,
          funcTags: funcConfig.tags,
          funcPermissions: funcConfig.permissions,
          allServices,
          data,
          session,
        })
        return await funcConfig.func(allServices, data, session!)
      }
    )) as Out
  }

  const allServices = await getAllServices()
  return (await funcConfig.func(allServices, data)) as Out
}
