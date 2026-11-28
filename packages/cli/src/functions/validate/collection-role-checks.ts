import { join } from 'node:path'
import { readJsonSafe } from './shared-checks.js'
import type { ValidateFinding } from './virtual-user-checks.js'

/** The grants that cover every collection, including collections added later. */
const WHOLE_COLLECTIONS = new Set(['collections', 'collections:*'])

/**
 * `collections` is for super admins. A system role ships with the product, so one that
 * holds the whole tree hands every collection, including every later one, to
 * whoever is given the role.
 */
export const runCollectionRoleChecks = async (
  dir: string
): Promise<ValidateFinding[]> => {
  const path = join(dir, '.pikku', 'scopes', 'pikku-roles-meta.gen.json')
  const roles =
    (await readJsonSafe<Record<string, { scopes?: string[] }>>(path)) ?? {}
  return Object.entries(roles)
    .filter(([, role]) =>
      role.scopes?.some((scope) => WHOLE_COLLECTIONS.has(scope))
    )
    .map(([name]) => ({
      id: 'collection-system-role',
      severity: 'warn',
      message: `The system role '${name}' holds 'collections', every collection including the ones added later`,
      path,
      fixHint:
        "Grant the collections the role needs, such as 'collections:offering:read', and keep 'collections' for a super admin you grant it to directly",
    }))
}
