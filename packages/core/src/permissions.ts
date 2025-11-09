import {
  CoreServices,
  CoreUserSession,
  PikkuWiringTypes,
  PermissionMetadata,
} from './types/core.types.js'
import {
  CorePermissionGroup,
  CorePikkuPermission,
} from './function/functions.types.js'
import { pikkuState } from './pikku-state.js'
import { ForbiddenError } from './errors/errors.js'
import { freezeDedupe } from './utils.js'

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
 * Registers a single permission function by name in the global permission store.
 *
 * This function is used by CLI-generated code to register permission functions
 * that can be referenced by name in metadata. It stores permissions in a special
 * namespace to avoid conflicts with tag-based permissions.
 *
 * @param {string} name - The unique name (pikkuFuncName) of the permission function.
 * @param {CorePikkuPermission} permission - The permission function to register.
 *
 * @example
 * ```typescript
 * // Called by CLI-generated pikku-permissions.gen.ts
 * registerPermission('adminPermission_src_permissions_ts_10_5', adminPermission)
 * registerPermission('readPermission_src_permissions_ts_20_10', readPermission)
 * ```
 */
export const registerPermission = (
  name: string,
  permission: CorePikkuPermission<any>
) => {
  const permissionStore = pikkuState('misc', 'permissions')
  permissionStore[name] = [permission]
}

/**
 * Retrieves a registered permission function by its name.
 *
 * This function looks up permissions that was registered with registerPermission.
 * It's used internally by the framework to resolve permission references in metadata.
 *
 * @param {string} name - The unique name (pikkuFuncName) of the permission function.
 * @returns {CorePikkuPermission | undefined} The permission function, or undefined if not found.
 *
 * @internal
 */
export const getPermissionByName = (
  name: string
): CorePikkuPermission | undefined => {
  const permissionStore = pikkuState('misc', 'permissions')
  const permission = permissionStore[name]
  if (Array.isArray(permission) && permission.length === 1) {
    return permission[0]
  }
  return undefined
}

/**
 * Adds global permissions for a specific tag.
 *
 * This function allows you to register permissions that will be applied to
 * any wiring (HTTP, Channel, Queue, Scheduler, MCP) that includes the matching tag.
 *
 * For tree-shaking benefits, wrap in a factory function:
 * `export const x = () => addPermission('tag', [...])`
 *
 * @param {string} tag - The tag that the permissions should apply to.
 * @param {any[]} permissions - The permissions array to apply for the specified tag.
 *
 * @returns {CorePermissionGroup | CorePikkuPermission[]} The permissions (for chaining/wrapping).
 *
 * @example
 * ```typescript
 * // Recommended: tree-shakeable
 * export const adminPermissions = () => addPermission('admin', [
 *   adminPermission,
 *   rolePermission({ role: 'admin' })
 * ])
 *
 * // Also works: no tree-shaking
 * export const apiPermissions = addPermission('api', [
 *   readPermission
 * ])
 * ```
 */
export const addPermission = (
  tag: string,
  permissions: CorePermissionGroup | CorePikkuPermission[]
): CorePermissionGroup | CorePikkuPermission[] => {
  const tagGroups = pikkuState('permissions', 'tagGroup')
  if (tagGroups[tag]) {
    throw new Error(
      `Permissions for tag '${tag}' already exist. Use a different tag or remove the existing permissions first.`
    )
  }
  tagGroups[tag] = permissions
  return permissions
}

const EMPTY: readonly (CorePermissionGroup | CorePikkuPermission)[] = []

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
export const getPermissionsForTags = (
  tags?: string[]
): readonly (CorePermissionGroup | CorePikkuPermission)[] => {
  if (!tags || tags.length === 0) {
    return EMPTY
  }

  const permissionsStore = pikkuState('permissions', 'tagGroup')
  const applicablePermissions: Array<
    CorePermissionGroup | CorePikkuPermission
  > = []

  // Collect permissions for all matching tags
  for (const tag of new Set(tags)) {
    const tagPermissions = permissionsStore[tag]
    if (tagPermissions) {
      if (Array.isArray(tagPermissions)) {
        applicablePermissions.push(...tagPermissions)
      } else {
        applicablePermissions.push(tagPermissions)
      }
    }
  }

  return applicablePermissions
}

const combinedPermissionsCache: Record<
  PikkuWiringTypes,
  Record<string, readonly (CorePermissionGroup | CorePikkuPermission)[]>
> = {
  [PikkuWiringTypes.http]: {},
  [PikkuWiringTypes.rpc]: {},
  [PikkuWiringTypes.channel]: {},
  [PikkuWiringTypes.queue]: {},
  [PikkuWiringTypes.scheduler]: {},
  [PikkuWiringTypes.mcp]: {},
  [PikkuWiringTypes.cli]: {},
  [PikkuWiringTypes.workflow]: {},
}

/**
 * Combines wiring-specific permissions with function-level permissions.
 *
 * This function resolves permission metadata into actual permission functions and combines them.
 * It filters out wire permissions without tags from inheritedPermissions to avoid duplication
 * (those are passed separately as wirePermissions).
 *
 * @param {object} options - Configuration object for combining permissions.
 * @param {PermissionMetadata[] | undefined} options.wireInheritedPermissions - Metadata from wiring (HTTP + tags + wire with tags).
 * @param {CorePermissionGroup | CorePikkuPermission[] | undefined} options.wirePermissions - Inline wire permissions.
 * @param {PermissionMetadata[] | undefined} options.funcInheritedPermissions - Function permissions metadata (only tags).
 * @param {CorePermissionGroup | CorePikkuPermission[] | undefined} options.funcPermissions - Inline function permissions.
 * @returns {(CorePermissionGroup | CorePikkuPermission)[]} Combined array of resolved permissions.
 *
 * @example
 * ```typescript
 * const combined = combinePermissions(wireType, wireId, {
 *   wireInheritedPermissions: meta.permissions,
 *   wirePermissions: inlinePermissions,
 *   funcInheritedPermissions: funcMeta.permissions,
 *   funcPermissions: funcConfig.permissions
 * })
 * ```
 */
export const combinePermissions = (
  wireType: PikkuWiringTypes,
  uid: string,
  {
    wireInheritedPermissions,
    wirePermissions,
    funcInheritedPermissions,
    funcPermissions,
  }: {
    wireInheritedPermissions?: PermissionMetadata[]
    wirePermissions?: CorePermissionGroup | CorePikkuPermission[]
    funcInheritedPermissions?: PermissionMetadata[]
    funcPermissions?: CorePermissionGroup | CorePikkuPermission[]
  } = {}
): readonly (CorePermissionGroup | CorePikkuPermission)[] => {
  if (combinedPermissionsCache[wireType][uid]) {
    return combinedPermissionsCache[wireType][uid]
  }

  const resolved: (CorePermissionGroup | CorePikkuPermission)[] = []

  // 1. Resolve wire inherited permissions (HTTP + tag groups + individual wire permissions)
  if (wireInheritedPermissions) {
    for (const meta of wireInheritedPermissions) {
      if (meta.type === 'http') {
        // Look up HTTP permission group from pikkuState
        const group = pikkuState('permissions', 'httpGroup')[meta.route]
        if (group) {
          if (Array.isArray(group)) {
            resolved.push(...group)
          } else {
            resolved.push(group)
          }
        }
      } else if (meta.type === 'tag') {
        // Look up tag permission group from pikkuState
        const group = pikkuState('permissions', 'tagGroup')[meta.tag]
        if (group) {
          if (Array.isArray(group)) {
            resolved.push(...group)
          } else {
            resolved.push(group)
          }
        }
      } else if (meta.type === 'wire') {
        // Individual wire permission (exported, not inline)
        const permission = getPermissionByName(meta.name)
        if (permission) {
          resolved.push(permission)
        }
      }
    }
  }

  // 2. Add inline wire permissions
  if (wirePermissions) {
    if (Array.isArray(wirePermissions)) {
      resolved.push(...wirePermissions)
    } else {
      resolved.push(wirePermissions)
    }
  }

  // 3. Resolve function inherited permissions (only tags, wire permissions already handled)
  if (funcInheritedPermissions) {
    for (const meta of funcInheritedPermissions) {
      if (meta.type === 'tag') {
        // Look up tag permission group from pikkuState
        const group = pikkuState('permissions', 'tagGroup')[meta.tag]
        if (group) {
          if (Array.isArray(group)) {
            resolved.push(...group)
          } else {
            resolved.push(group)
          }
        }
      }
      // Note: wire permissions are already handled in wireInheritedPermissions
    }
  }

  // 4. Add inline function permissions
  if (funcPermissions) {
    if (Array.isArray(funcPermissions)) {
      resolved.push(...funcPermissions)
    } else {
      resolved.push(funcPermissions)
    }
  }

  // Deduplicate and freeze
  combinedPermissionsCache[wireType][uid] = freezeDedupe(resolved) as readonly (
    | CorePermissionGroup
    | CorePikkuPermission
  )[]

  return combinedPermissionsCache[wireType][uid]
}

/**
 * Runs permission checks using combined permissions from all sources.
 * Combines permissions from wire and function levels, then validates them.
 */
export const runPermissions = async (
  wireType: PikkuWiringTypes,
  uid: string,
  {
    wireInheritedPermissions,
    wirePermissions,
    funcInheritedPermissions,
    funcPermissions,
    allServices,
    data,
    session,
  }: {
    wireInheritedPermissions?: PermissionMetadata[]
    wirePermissions?: CorePermissionGroup | CorePikkuPermission[]
    funcInheritedPermissions?: PermissionMetadata[]
    funcPermissions?: CorePermissionGroup | CorePikkuPermission[]
    allServices: CoreServices
    data: any
    session?: CoreUserSession
  }
) => {
  // Combine all permissions: wireInheritedPermissions → wirePermissions → funcInheritedPermissions → funcPermissions
  const allPermissions = combinePermissions(wireType, uid, {
    wireInheritedPermissions,
    wirePermissions,
    funcInheritedPermissions,
    funcPermissions,
  })

  // Check all combined permissions - at least one must pass if any exist
  if (allPermissions.length > 0) {
    let permissioned = false
    for (const permission of allPermissions) {
      const result = await verifyPermissions(
        typeof permission === 'function' ? { permission } : permission,
        allServices,
        data,
        session
      )
      if (result) {
        permissioned = true
        // Continue executing all permissions (don't break early)
      }
    }
    if (!permissioned) {
      allServices.logger.debug('Permission denied - combined permissions')
      throw new ForbiddenError('Permission denied')
    }
  }
}
