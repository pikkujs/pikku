import { ForbiddenError } from '../errors/errors.js'
import { verifyPermissions } from '../permissions.js'
import { pikkuState } from '../pikku-state.js'
import { coerceTopLevelDataFromSchema, validateSchema } from '../schema.js'
import {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '../types/core.types.js'
import {
  CoreAPIFunction,
  CoreAPIFunctionSessionless,
  CorePermissionGroup,
} from './functions.types.js'

export const addFunction = (
  funcName: string,
  func: CoreAPIFunction<any, any> | CoreAPIFunctionSessionless<any, any>
) => {
  pikkuState('functions', 'nameToFunction').set(funcName, func)
}

export const runPikkuFuncDirectly = async <In, Out>(
  funcName: string,
  allServices: CoreServices,
  data: In,
  session?: CoreUserSession
) => {
  const func = pikkuState('functions', 'nameToFunction').get(funcName)
  if (!func) {
    throw new Error(`Function not found: ${funcName}`)
  }
  return (await func(allServices, data, session!)) as Out
}

export const runPikkuFunc = async <In = any, Out = any>(
  funcName: string,
  {
    singletonServices,
    getAllServices,
    data,
    session,
    permissions,
    coerceDataFromSchema,
  }: {
    singletonServices: CoreSingletonServices
    getAllServices: () => Promise<CoreServices> | CoreServices
    data: In
    session?: CoreUserSession
    permissions?: CorePermissionGroup
    coerceDataFromSchema?: boolean
  }
): Promise<Out> => {
  const func = pikkuState('functions', 'nameToFunction').get(funcName)
  if (!func) {
    throw new Error(`Function not found: ${funcName}`)
  }
  const funcMeta = pikkuState('functions', 'meta')[funcName]
  if (!funcMeta) {
    throw new Error(`Function meta not found: ${funcName}`)
  }
  const schemaName = funcMeta.schemaName
  if (schemaName) {
    // Validate request data against the defined schema, if any
    await validateSchema(
      singletonServices.logger,
      singletonServices.schema,
      schemaName,
      data
    )
    // Coerce (top level) query string parameters or date objects if specified by the schema
    if (coerceDataFromSchema) {
      coerceTopLevelDataFromSchema(schemaName, data)
    }
  }

  const allServices = await getAllServices()

  // Execute permission checks
  const permissioned = await verifyPermissions(
    permissions,
    allServices,
    data,
    session
  )

  if (permissioned === false) {
    throw new ForbiddenError('Permission denied')
  }

  return (await func(allServices, data, session!)) as Out
}
