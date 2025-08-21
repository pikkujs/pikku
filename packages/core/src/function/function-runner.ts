import { ForbiddenError } from '../errors/errors.js'
import { runMiddleware } from '../middleware-runner.js'
import { verifyPermissions, getPermissionsForTags } from '../permissions.js'
import { pikkuState } from '../pikku-state.js'
import { coerceTopLevelDataFromSchema, validateSchema } from '../schema.js'
import {
  CoreServices,
  CoreUserSession,
  CorePikkuMiddleware,
} from '../types/core.types.js'
import {
  CorePermissionGroup,
  CorePikkuFunction,
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
} from './functions.types.js'

export const addFunction = (
  funcName: string,
  funcConfig:
    | CorePikkuFunctionConfig<any, any>
    | CorePikkuFunctionSessionless<any, any>
    | CorePikkuFunction<any, any>
) => {
  if (funcConfig instanceof Function) {
    funcConfig = { func: funcConfig }
  }
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

  let permissioned = true

  // Check tagged permissions first - ALL must pass
  const taggedPermissions = getPermissionsForTags([
    ...tags,
    ...(funcConfig.tags || []),
  ])
  if (taggedPermissions.length > 0) {
    const taggedResults = await Promise.all(
      taggedPermissions.map((permission) =>
        permission(allServices, data, session)
      )
    )
    permissioned = taggedResults.every((result) => result)
  }

  // Only check function permissions if tagged permissions passed
  if (permissioned && funcConfig.permissions) {
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
