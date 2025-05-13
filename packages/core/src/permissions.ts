import { CoreServices, CoreUserSession } from './types/core.types.js'
import { CorePermissionGroup } from './types/functions.types.js'

/**
 * This function validates permissions by iterating over permission groups and executing the corresponding permission functions. If all functions in at least one group return true, the permission is considered valid.
 * @param services - The core services required for permission validation.
 * @param data - The data to be used in the permission validation functions.
 * @param session - An optional user session for permission validation.
 * @returns A promise that resolves to void.
 */
export const verifyPermissions = async (
  permissions: CorePermissionGroup<any>,
  services: CoreServices,
  data: any,
  session?: CoreUserSession
): Promise<boolean> => {
  if (!permissions) {
    return true
  }

  let valid = false
  const permissionGroups = Object.values(permissions)
  if (permissionGroups.length === 0) {
    return true
  }

  for (const funcs of permissionGroups) {
    if (funcs instanceof Array) {
      const permissioned = await Promise.all(
        funcs.map((func) => func(services, data, session))
      )
      if (permissioned.every((result) => result)) {
        valid = true
      }
    } else {
      valid = await funcs(services, data, session)
    }
    if (valid) {
      return true
    }
  }
  return false
}
