import type { AuditEvent } from '@pikku/core/ecosystem/services'
import { pikkuFunc } from '#pikku/function'
import {
  resolveAuditUsers,
  type AuditUserDirectory,
} from '../lib/resolve-audit-users.js'

export type GetAuditsInput = {
  /** Restrict to these users. An empty array matches nothing. */
  userIds?: string[]
  /** Restrict to these event types. An empty array matches nothing. */
  types?: string[]
  /** Inclusive lower bound on `occurredAt` (ISO 8601). */
  from?: string
  /** Exclusive upper bound on `occurredAt` (ISO 8601). */
  to?: string
  limit?: number
  offset?: number
}

export type GetAuditsOutput = {
  events: AuditEvent[]
  /**
   * Who the user ids on this page belong to. Empty when no auth is wired, and
   * missing an id whose account has since been deleted — the reader falls back
   * to the id, which is what the trail actually recorded.
   */
  users: AuditUserDirectory
  /** Offset of the next page, or `null` at the end. */
  nextCursor: number | null
  /**
   * False when the configured sink cannot be read back — a queue producer, or
   * no sink at all. The console says so rather than showing an empty trail,
   * because "nothing happened" and "you cannot see what happened" are very
   * different answers to give someone auditing a system.
   */
  readable: boolean
}

export const getAudits = pikkuFunc<GetAuditsInput, GetAuditsOutput>({
  title: 'Get Audits',
  description:
    'Returns a page of the audit trail, newest first, optionally filtered by user, event type, and time range. Reports readable: false when the configured audit sink is write-only.',
  expose: true,
  scopes: ['pikku:console:audit:read'],
  func: async ({ audit, auth, logger }, input) => {
    if (!audit?.query) {
      return { events: [], users: {}, nextCursor: null, readable: false }
    }
    const { events, nextCursor } = await audit.query({
      userIds: input?.userIds,
      types: input?.types,
      from: input?.from,
      to: input?.to,
      limit: input?.limit,
      offset: input?.offset,
    })
    const users = await resolveAuditUsers(
      auth,
      events.map((event) => event.userIdentity?.userId),
      logger
    )
    return { events, users, nextCursor, readable: true }
  },
})
