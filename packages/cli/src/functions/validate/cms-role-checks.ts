import { join } from 'node:path'
import { readJsonSafe } from './shared-checks.js'
import type { ValidateFinding } from './virtual-user-checks.js'

/** The grants that cover the whole CMS, including collections added later. */
const WHOLE_CMS = new Set(['cms', 'cms:*'])

/**
 * `cms` is for super admins. A system role ships with the product, so one that
 * holds the whole tree hands every collection, including every later one, to
 * whoever is given the role.
 */
export const runCmsRoleChecks = async (
  dir: string
): Promise<ValidateFinding[]> => {
  const path = join(dir, '.pikku', 'scopes', 'pikku-roles-meta.gen.json')
  const roles =
    (await readJsonSafe<Record<string, { scopes?: string[] }>>(path)) ?? {}
  return Object.entries(roles)
    .filter(([, role]) => role.scopes?.some((scope) => WHOLE_CMS.has(scope)))
    .map(([name]) => ({
      id: 'cms-system-role',
      severity: 'warn',
      message: `The system role '${name}' holds 'cms', every CMS collection including the ones added later`,
      path,
      fixHint:
        "Grant the collections the role needs, such as 'cms:offering:read', and keep 'cms' for a super admin you grant it to directly",
    }))
}
