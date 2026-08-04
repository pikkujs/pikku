import { pikkuFunc } from '#pikku'
import {
  resolveAuditUsers,
  type AuditUserProfile,
} from '../lib/resolve-audit-users.js'

export type GetAuditFiltersOutput = {
  /**
   * Every user that appears in the trail, sorted, named where the account still
   * exists. The id remains the value to filter by — a name is not unique and
   * can change after the event it is shown against.
   */
  users: Array<{ userId: string } & AuditUserProfile>
  /** Every event type that appears in the trail, sorted. */
  types: string[]
}

/**
 * The filter vocabulary for the audit screen.
 *
 * Separate from `getAudits` because it is deliberately *not* narrowed by the
 * current filters: a list that only offered what the current page shows could
 * never be used to reach anything else. It also lets the console cache it once
 * rather than recomputing two distinct scans on every page of an infinite list.
 */
export const getAuditFilters = pikkuFunc<null, GetAuditFiltersOutput>({
  title: 'Get Audit Filters',
  description:
    'Returns the distinct users and event types present in the audit trail, for populating the audit screen filters.',
  expose: true,
  scopes: ['pikku:audit:read'],
  func: async ({ audit, auth, logger }) => {
    if (!audit?.facets) {
      return { users: [], types: [] }
    }
    const { userIds, types } = await audit.facets()
    const directory = await resolveAuditUsers(auth, userIds, logger)
    return {
      users: userIds.map((userId) => ({
        userId,
        ...directory[userId],
      })),
      types,
    }
  },
})
