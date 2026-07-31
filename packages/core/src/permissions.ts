import type {
  CoreServices,
  CoreUserSession,
  PikkuWire,
} from './types/core.types.js'
import type {
  CorePermissionGroup,
  CorePikkuPermission,
} from './function/functions.types.js'
import { pikkuState } from './pikku-state.js'
import { ForbiddenError } from './errors/errors.js'

const verifyPermissions = async (
  permissions: CorePermissionGroup,
  services: CoreServices,
  data: any,
  wire: PikkuWire<any, never, any, CoreUserSession, never, never, never>
): Promise<boolean> => {
  if (!permissions) {
    return true
  }

  const permissionGroups = Object.values(permissions)
  if (permissionGroups.length === 0) {
    return true
  }

  for (const funcs of permissionGroups) {
    if (funcs instanceof Array) {
      const permissioned = await Promise.all(
        funcs.map((func) => func(services, data, wire))
      )
      if (permissioned.every((result) => result)) {
        return true
      }
    } else {
      if (await funcs(services, data, wire as any)) {
        return true
      }
    }
  }
  return false
}


const globalPermissionsCache: Record<
  string,
  readonly (CorePermissionGroup | CorePikkuPermission)[]
> = {}

export const clearPermissionsCache = () => {
  for (const key of Object.keys(globalPermissionsCache)) {
    delete globalPermissionsCache[key]
  }
}

export const addGlobalPermission = (
  permissions: CorePermissionGroup | CorePikkuPermission[],
  packageName: string | null = null
): CorePermissionGroup | CorePikkuPermission[] => {
  const state = pikkuState(packageName, 'permissions', 'global') as unknown as (
    | CorePermissionGroup
    | CorePikkuPermission
  )[]
  if (Array.isArray(permissions)) {
    state.push(...(permissions as CorePikkuPermission[]))
  } else {
    state.push(permissions)
  }
  clearPermissionsCache()
  return permissions
}

/**
 * @deprecated Tag-level permissions were removed in #972 — permissions are now
 * function-scoped only (declare them on the function via `pikkuFunc({ permissions })`).
 * This throwing stub exists solely so the pinned bootstrap CLI (which still
 * generates an `addTagPermission` wrapper) can resolve the import at build time;
 * it is never called. Delete once `PIKKU_CLI_VERSION` in the CLI build is bumped
 * past the release that removes tag permissions.
 */
export const addTagPermission = (
  _tag: string,
  _permissions: CorePermissionGroup | CorePikkuPermission[],
  _packageName: string | null = null
): never => {
  throw new Error(
    'addTagPermission was removed in #972 — tag-level permissions no longer exist. Declare permissions on the function definition instead: pikkuFunc({ permissions }).'
  )
}

const resolveGlobalPermissions = (
  packageName: string | null
): readonly (CorePermissionGroup | CorePikkuPermission)[] => {
  const key = packageName ?? ''
  const cached = globalPermissionsCache[key]
  if (cached) {
    return cached
  }
  const globals = pikkuState(
    packageName,
    'permissions',
    'global'
  ) as unknown as (CorePermissionGroup | CorePikkuPermission)[]
  const resolved = globals && globals.length > 0 ? [...globals] : []
  globalPermissionsCache[key] = resolved
  return resolved
}

const asGroup = (
  entry: CorePermissionGroup | CorePikkuPermission
): CorePermissionGroup =>
  typeof entry === 'function' ? { permission: entry } : entry

export const runPermissions = async ({
  funcPermissions,
  services,
  wire,
  data,
  packageName = null,
  label = 'function',
}: {
  funcPermissions?: CorePermissionGroup | CorePikkuPermission[]
  services: CoreServices
  wire: PikkuWire<any, never, any, CoreUserSession, never, never, never>
  data: any
  packageName?: string | null
  /** What the non-global gate is called in debug logs, e.g. 'function', 'agent'. */
  label?: string
}) => {
  const globals = resolveGlobalPermissions(packageName)
  for (const entry of globals) {
    if (!(await verifyPermissions(asGroup(entry), services, data, wire))) {
      services.logger.debug('Permission denied - global permission')
      throw new ForbiddenError('Permission denied')
    }
  }

  if (funcPermissions) {
    const group = Array.isArray(funcPermissions)
      ? { permissions: funcPermissions }
      : funcPermissions
    if (group && Object.keys(group).length > 0) {
      if (!(await verifyPermissions(group, services, data, wire))) {
        services.logger.debug(`Permission denied - ${label} permission`)
        throw new ForbiddenError('Permission denied')
      }
    }
  }
}

export const checkAuthPermissions = async (
  /** Must be the live permission group from the func/agent config, never metadata. */
  funcPermissions: CorePermissionGroup | undefined,
  session: CoreUserSession,
  services: CoreServices,
  packageName: string | null = null
): Promise<boolean> => {
  const wire = { session } as unknown as PikkuWire<
    any,
    never,
    any,
    CoreUserSession,
    never,
    never
  >

  const authPerms: CorePikkuPermission<any, any, any>[] = []

  const collect = (perm: CorePermissionGroup | CorePikkuPermission) => {
    if (typeof perm === 'function') {
      if ((perm as any).__pikkuAuth) {
        authPerms.push(perm)
      }
    } else if (perm && typeof perm === 'object') {
      for (const funcs of Object.values(perm)) {
        const arr = Array.isArray(funcs) ? funcs : [funcs]
        for (const fn of arr) {
          if (typeof fn === 'function' && (fn as any).__pikkuAuth) {
            authPerms.push(fn)
          }
        }
      }
    }
  }

  for (const entry of resolveGlobalPermissions(packageName)) {
    collect(entry)
  }

  if (funcPermissions) {
    collect(funcPermissions)
  }

  if (authPerms.length === 0) return true

  for (const perm of authPerms) {
    const result = await perm(services, null, wire)
    if (result) return true
  }
  return false
}
