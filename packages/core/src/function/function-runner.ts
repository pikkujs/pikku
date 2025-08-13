import { ForbiddenError } from '../errors/errors.js'
import { runMiddleware } from '../middleware-runner.js'
import { verifyPermissions } from '../permissions.js'
import { pikkuState } from '../pikku-state.js'
import { coerceTopLevelDataFromSchema, validateSchema } from '../schema.js'
import {
  CoreServices,
  CoreUserSession,
  CorePikkuMiddleware,
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
  funcName: string,
  {
    getAllServices,
    data,
    session,
    permissions: transportPermissions,
    middleware: transportMiddleware,
    coerceDataFromSchema,
  }: {
    getAllServices: () => Promise<CoreServices> | CoreServices
    data: In
    session?: CoreUserSession
    permissions?: CorePermissionGroup
    middleware?: CorePikkuMiddleware[]
    coerceDataFromSchema?: boolean
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

  const schemaName = funcMeta.schemaName
  if (schemaName) {
    // Validate request data against the defined schema, if any
    await validateSchema(
      allServices.logger,
      allServices.schema,
      schemaName,
      data
    )
    // Coerce (top level) query string parameters or date objects if specified by the schema
    if (coerceDataFromSchema) {
      coerceTopLevelDataFromSchema(schemaName, data)
    }
  }

  let permissioned = true
  if (funcConfig.permissions) {
    permissioned = await verifyPermissions(
      funcConfig.permissions,
      allServices,
      data,
      session
    )
  }
  if (!permissioned && transportPermissions) {
    permissioned = await verifyPermissions(
      transportPermissions,
      allServices,
      data,
      session
    )
  }

  if (permissioned === false) {
    throw new ForbiddenError('Permission denied')
  }

  if (transportMiddleware || funcConfig.middleware) {
    return (await runMiddleware<CorePikkuMiddleware>(
      allServices,
      {
        http: allServices.http,
        mcp: allServices.mcp,
        rpc: allServices.rpc,
      },
      [...(transportMiddleware || []), ...(funcConfig.middleware || [])],
      async () => await funcConfig.func(allServices, data, session!)
    )) as Out
  }

  return (await funcConfig.func(allServices, data, session!)) as Out
}
