import type {
  CoreServices,
  CoreUserSession,
  PermissionMetadata,
  PikkuWire,
} from './types/core.types.js'
import type {
  CorePermissionGroup,
  CorePikkuPermission,
} from './function/functions.types.js'
import { pikkuState } from './pikku-state.js'
import { ForbiddenError } from './errors/errors.js'

/**
 * Evaluates a single permission group. A group ORs its branches together and
 * ANDs the entries within a branch: the group passes if at least one branch
 * (an array of permission functions, all of which must return true — or a lone
 * function) is satisfied.
 *
 * This is the only place OR lives in authorization. Everything cross-cutting —
 * global permissions, scopes, and auth — ANDs together; a function's own
 * `permissions` group is the sole place where "owner OR admin"-style
 * alternatives are expressed.
 *
 * @param permissions - The permission group to evaluate.
 * @param services - The core services required for permission validation.
 * @param data - The request data passed to each permission function.
 * @param wire - The wire object containing request/response context and session.
 * @returns A promise resolving to true if the group is satisfied.
 */
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

/**
 * Retrieves a registered permission function by its name.
 *
 * This function looks up permissions that was registered with registerPermission.
 * It's used internally by the framework to resolve permission references in metadata.
 *
 * @param {string} name - The unique name (pikkuFuncId) of the permission function.
 * @param {string | null} packageName - Optional package namespace.
 * @returns {CorePikkuPermission | undefined} The permission function, or undefined if not found.
 *
 * @internal
 */
const getPermissionByName = (
  name: string,
  packageName: string | null = null
): CorePikkuPermission | undefined => {
  const permissionStore = pikkuState(packageName, 'misc', 'permissions')
  const permission = permissionStore[name]
  if (Array.isArray(permission) && permission.length === 1) {
    return permission[0]
  }
  return undefined
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

/**
 * Registers wire-agnostic global permissions. Global permissions are an AND
 * gate: every registered requirement must pass on every function invocation,
 * regardless of transport. A requirement may be a single permission function
 * or a permission group (in which case that group ORs internally, but the
 * group as a whole must still pass).
 *
 * Global permissions never satisfy a function's own `permissions` — the two
 * are independent gates that both have to pass, so a broad global can only
 * ever narrow access.
 *
 * @example
 * addGlobalPermission([signedInUser])
 */
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

/**
 * Resolves the registered global permission requirements for a package,
 * caching the resolved array per package. The cache is keyed by package name
 * (an empty string for the root package) so packages never collide, and it is
 * cleared whenever globals are registered or on hot reload.
 */
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

/**
 * Runs authorization for a function invocation. Two independent gates, both of
 * which must pass:
 *
 * 1. Global permissions — AND. Every registered global requirement must pass.
 * 2. Function permissions — OR. The function's own `permissions` group must be
 *    satisfied (see {@link verifyPermissions}).
 *
 * A passing global requirement never contributes to the function gate, so a
 * broad global like `signedIn` can't satisfy an admin-only function.
 */
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

/**
 * Checks whether a session passes the auth checks (pikkuAuth only) for a
 * given function/agent. Skips pikkuPermission checks since those require
 * request data which isn't available at filter time. Global auth requirements
 * are included so a filtered list honours app-wide auth.
 *
 * @param funcPermissions - The PermissionMetadata[] from function or agent metadata
 * @param session - The user's session
 * @param services - Singleton services
 * @param packageName - Optional package namespace
 * @returns true if the session passes the auth checks (or no auth checks exist)
 */
export const checkAuthPermissions = async (
  funcPermissions: PermissionMetadata[] | undefined,
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

  // Collect auth-only (pikkuAuth) predicates from globals and the function's
  // referenced permissions. Data-dependent permissions are ignored — they
  // can't be evaluated without request data at filter time.
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

  if (funcPermissions?.length) {
    for (const meta of funcPermissions) {
      if (meta.type === 'wire') {
        const permission = getPermissionByName(meta.name, packageName)
        if (permission) {
          collect(permission)
        }
      }
    }
  }

  // No auth permissions = allowed (only data-dependent permissions exist)
  if (authPerms.length === 0) return true

  for (const perm of authPerms) {
    const result = await perm(services, null, wire)
    if (result) return true
  }
  return false
}
