import { ForbiddenError } from '../errors/errors.js'
import { runMiddleware } from '../middleware-runner.js'
import { verifyPermissions } from '../permissions.js'
import { pikkuState } from '../pikku-state.js'
import { coerceTopLevelDataFromSchema, validateSchema } from '../schema.js'
import { Logger } from '../services/logger.js'
import {
  CoreServices,
  CoreUserSession,
  PikkuFunctionMiddleware,
} from '../types/core.types.js'
import {
  CorePermissionGroup,
  CorePikkuFunctionConfig,
} from './functions.types.js'

// Permission merging function
function mergePermissions(
  logger: Logger,
  funcName: string,
  funcPermissions?: CorePermissionGroup,
  transportPermissions?: CorePermissionGroup
): CorePermissionGroup | undefined {
  if (!funcPermissions && !transportPermissions) {
    return undefined
  }

  if (!funcPermissions) {
    return transportPermissions
  }

  if (!transportPermissions) {
    return funcPermissions
  }

  // Start with a copy of function permissions
  const mergedPermissions = { ...funcPermissions }

  // Merge in transport permissions
  for (const [key, transportValue] of Object.entries(transportPermissions)) {
    if (key in mergedPermissions) {
      // For permission arrays, concatenate and deduplicate values
      if (
        Array.isArray(mergedPermissions[key]) &&
        Array.isArray(transportValue)
      ) {
        mergedPermissions[key] = [
          ...new Set([...mergedPermissions[key], ...transportValue]),
        ]
      }
      // For other types, warn about conflict and use the more restrictive (transport-level) value
      else {
        logger.warn(
          `Permission conflict on key "${key}" for function "${funcName}". Using transport-level permission.`
        )
        mergedPermissions[key] = transportValue
      }
    } else {
      // If key doesn't exist in function permissions, add it
      mergedPermissions[key] = transportValue
    }
  }

  return mergedPermissions
}

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
    coerceDataFromSchema,
  }: {
    getAllServices: () => Promise<CoreServices> | CoreServices
    data: In
    session?: CoreUserSession
    permissions?: CorePermissionGroup
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

  // Execute permission checks
  const mergedPermissions = mergePermissions(
    allServices.logger,
    funcName,
    funcConfig.permissions,
    transportPermissions
  )
  const permissioned = await verifyPermissions(
    mergedPermissions,
    allServices,
    data,
    session
  )

  if (permissioned === false) {
    throw new ForbiddenError('Permission denied')
  }

  if (funcConfig.middleware) {
    return (await runMiddleware<PikkuFunctionMiddleware>(
      allServices,
      {
        http: allServices.http,
        mcp: allServices.mcp,
        rpc: allServices.rpc,
      },
      funcConfig.middleware,
      async () => await funcConfig.func(allServices, data, session!)
    )) as Out
  }

  return (await funcConfig.func(allServices, data, session!)) as Out
}
