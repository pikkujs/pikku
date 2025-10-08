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
} from '../types/core.types.js'
import {
  CorePermissionGroup,
  CorePikkuFunctionConfig,
} from './functions.types.js'

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
    data,
    session,
    permissions: wiringPermissions,
    middleware: wiringMiddleware,
    coerceDataFromSchema,
    tags = [],
  }: {
    getAllServices: () => Promise<CoreServices> | CoreServices
    data: In
    session?: CoreUserSession
    permissions?: CorePermissionGroup
    middleware?: CorePikkuMiddleware[]
    coerceDataFromSchema?: boolean
    tags?: string[]
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

  if (funcConfig.auth && !session) {
    throw new ForbiddenError(
      `Function ${funcName} requires authentication even though transport does not`
    )
  }

  const allServices = await getAllServices()

  const inputSchemaName = funcMeta.inputSchemaName
  if (inputSchemaName) {
    // Validate request data against the defined schema, if any
    await validateSchema(
      allServices.logger,
      allServices.schema,
      inputSchemaName,
      data
    )
    // Coerce (top level) query string parameters or date objects if specified by the schema
    if (coerceDataFromSchema) {
      coerceTopLevelDataFromSchema(inputSchemaName, data)
    }
  }

  // Run permission checks in the specified order
  await runPermissions(wireType, wireId, {
    wiringTags: tags,
    wiringPermissions,
    funcTags: funcConfig.tags,
    funcPermissions: funcConfig.permissions,
    allServices,
    data,
    session,
  })

  // Combine all middleware: wiring tags → wiring middleware → func middleware → func tags
  const allMiddleware = combineMiddleware(wireType, wireId, {
    wiringTags: tags,
    wiringMiddleware,
    funcMiddleware: funcConfig.middleware,
    funcTags: funcConfig.tags,
  })

  if (allMiddleware.length > 0) {
    return (await runMiddleware<CorePikkuMiddleware>(
      allServices,
      {
        http: allServices.http,
        mcp: allServices.mcp,
        rpc: allServices.rpc,
      },
      allMiddleware,
      async () => await funcConfig.func(allServices, data, session!)
    )) as Out
  }

  return (await funcConfig.func(allServices, data, session!)) as Out
}
