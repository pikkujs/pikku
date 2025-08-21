import { CoreServices, CoreUserSession } from './types/core.types.js'
import { CorePermissionGroup } from './function/functions.types.js'
import { pikkuState } from './pikku-state.js'

/**
 * This function validates permissions by iterating over permission groups and executing the corresponding permission functions. If all functions in at least one group return true, the permission is considered valid.
 * @param services - The core services required for permission validation.
 * @param data - The data to be used in the permission validation functions.
 * @param session - An optional user session for permission validation.
 * @returns A promise that resolves to void.
 */
export const verifyPermissions = async (
  permissions: CorePermissionGroup,
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

/**
 * Adds global permissions for a specific tag.
 *
 * This function allows you to register permissions that will be applied to
 * any wiring (HTTP, Channel, Queue, Scheduler, MCP) that includes the matching tag.
 *
 * @param {string} tag - The tag that the permissions should apply to.
 * @param {any[]} permissions - The permissions array to apply for the specified tag.
 *
 * @throws {Error} If permissions for the tag already exist.
 *
 * @example
 * ```typescript
 * // Add admin permissions for admin endpoints
 * addPermission('admin', [adminPermission])
 *
 * // Add authentication permissions for auth endpoints
 * addPermission('auth', [authPermission])
 *
 * // Add read permissions for all API endpoints
 * addPermission('api', [readPermission])
 * ```
 */
export const addPermission = (tag: string, permissions: any[]) => {
  const permissionsStore = pikkuState('misc', 'permissions')

  // Check if tag already exists
  if (permissionsStore[tag]) {
    throw new Error(
      `Permissions for tag '${tag}' already exist. Use a different tag or remove the existing permissions first.`
    )
  }

  permissionsStore[tag] = permissions
}

/**
 * Retrieves permissions for a given set of tags.
 *
 * This function looks up all permissions registered for any of the provided tags
 * and returns them as a flattened array.
 *
 * @param {string[]} tags - Array of tags to look up permissions for.
 * @returns {any[]} Array of permission functions that apply to the given tags.
 *
 * @example
 * ```typescript
 * // Get all permissions for tags 'api' and 'auth'
 * const permissions = getPermissionsForTags(['api', 'auth'])
 * ```
 */
export const getPermissionsForTags = (tags?: string[]): any[] => {
  if (!tags || tags.length === 0) {
    return []
  }

  const permissionsStore = pikkuState('misc', 'permissions')
  const applicablePermissions: any[] = []

  // Collect permissions for all matching tags
  for (const tag of new Set(tags)) {
    const tagPermissions = permissionsStore[tag]
    if (tagPermissions) {
      applicablePermissions.push(...tagPermissions)
    }
  }

  return applicablePermissions
}
