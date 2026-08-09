import type {
  CoreServices,
  CoreUserSession,
  PikkuWire,
} from './types/core.types.js'
import type { PikkuRPC } from './wirings/rpc/rpc-types.js'

/**
 * The wire a permission function sees. `Out = never` denies it `channel.send`.
 *
 * knowledge: decisions/security/a-permission-gets-a-wire-it-cannot-reply-on.md
 */
export type PermissionWire = PikkuWire<
  any,
  never,
  false,
  any,
  PikkuRPC,
  never,
  never
>
import type {
  AuthBranded,
  CorePermissionGroup,
  CorePikkuPermission,
} from './function/functions.types.js'
import { pikkuState } from './pikku-state.js'
import { ForbiddenError } from './errors/errors.js'

const verifyPermissions = async (
  permissions: CorePermissionGroup,
  services: CoreServices,
  data: any,
  wire: PermissionWire
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
      if (await funcs(services, data, wire)) {
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

const bucket = (
  packageName: string | null
): (CorePermissionGroup | CorePikkuPermission)[] =>
  (pikkuState(packageName, 'permissions', 'global') as unknown as (
    | CorePermissionGroup
    | CorePikkuPermission
  )[]) ?? []

/**
 * Global permissions in effect for a function, root ones first.
 *
 * A function that belongs to a package reads *both* buckets, not just its own.
 * The generated `addGlobalPermission` wrapper always registers under the root
 * (`null`) package — it takes no package argument — so resolving the package
 * bucket alone meant an application's "every request needs a signed-in user"
 * rule silently stopped at the addon boundary, and the bucket the addon's
 * functions did read was one no host could write to. Both directions of that
 * are wrong, and the safe union is to apply everything: globals are an AND
 * gate, so adding the root ones can only ever tighten.
 *
 * knowledge: decisions/security/global-permissions-and-function-permissions-are-independent-gates.md
 */
const resolveGlobalPermissions = (
  packageName: string | null
): readonly (CorePermissionGroup | CorePikkuPermission)[] => {
  const key = packageName ?? ''
  const cached = globalPermissionsCache[key]
  if (cached) {
    return cached
  }
  const resolved = packageName
    ? [...bucket(null), ...bucket(packageName)]
    : [...bucket(null)]
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
  wire: PermissionWire
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
      if ((perm as AuthBranded).__pikkuAuth) {
        authPerms.push(perm)
      }
    } else if (perm && typeof perm === 'object') {
      for (const funcs of Object.values(perm)) {
        const arr = Array.isArray(funcs) ? funcs : [funcs]
        for (const fn of arr) {
          if (typeof fn === 'function' && (fn as AuthBranded).__pikkuAuth) {
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
