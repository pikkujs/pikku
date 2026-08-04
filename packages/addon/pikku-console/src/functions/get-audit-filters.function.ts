import { pikkuFunc } from '#pikku'

export type GetAuditFiltersOutput = {
  /** Every actor that appears in the trail, sorted. */
  actorUserIds: string[]
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
    'Returns the distinct actors and event types present in the audit trail, for populating the audit screen filters.',
  expose: true,
  scopes: ['pikku:audit:read'],
  func: async ({ audit }) => {
    if (!audit?.facets) {
      return { actorUserIds: [], types: [] }
    }
    return await audit.facets()
  },
})
