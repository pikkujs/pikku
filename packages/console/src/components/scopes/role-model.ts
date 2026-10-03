import type { DeclaredScope } from './scope-tree'
import { isScopeSelected } from './scope-tree'

const humaniseSegment = (segment: string) =>
  segment
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())

/** A scope id read as words, area first: `admin:audit:read` is "Admin › Audit › Read". */
export const scopeName = (id: string): string =>
  id.split(':').map(humaniseSegment).join(' › ')

/**
 * The permissions a person can be given, counted the way the Scopes page lists
 * them: an area and the groups directly inside it are headings when they hold
 * anything, and every other declared scope is one permission.
 */
export const declaredPermissions = (
  declared: DeclaredScope[]
): DeclaredScope[] =>
  declared.filter(
    (scope) =>
      scope.declared &&
      (scope.id.split(':').length > 2 ||
        !declared.some(
          (other) => other.declared && other.id.startsWith(`${scope.id}:`)
        ))
  )

/** How many of the declared permissions a set of grants reaches, directly or through an ancestor. */
export const coveredPermissionCount = (
  grants: string[],
  declared: DeclaredScope[]
): number =>
  declaredPermissions(declared).filter((scope) =>
    isScopeSelected(grants, scope.id)
  ).length

export type RoleGrant = {
  id: string
  name: string
  description?: string
  /** Covers every declared scope nested beneath it, not just itself. */
  wholeArea: boolean
  /** Granted but no longer declared in code, so it allows nothing. */
  stale: boolean
}

/** What each of a role's grants means, in the order the role lists them. */
export const describeGrants = (
  grants: string[],
  declared: DeclaredScope[]
): RoleGrant[] =>
  grants.map((id) => {
    const scope = declared.find((entry) => entry.id === id)
    return {
      id,
      name: scopeName(id),
      description: scope?.description,
      wholeArea: declared.some(
        (other) => other.declared && other.id.startsWith(`${id}:`)
      ),
      stale: !scope?.declared,
    }
  })
