import type { AuditEvent } from '@pikku/core/services'
import { pikkuFunc } from '#pikku/addon/function'
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
  /**
   * Whether the trail still verifies, so an operator can see tampering. Present
   * only when the configured sink implements `verify`; absent means the sink
   * cannot say, which is not the same as intact.
   */
  intact?: boolean
}

export const getAudits = pikkuFunc<GetAuditsInput, GetAuditsOutput>({
  title: 'Get Audits',
  description:
    'Returns a page of the audit trail, newest first, optionally filtered by user, event type, and time range. Reports readable: false when the configured audit sink is write-only, and intact when the sink can verify its own trail.',
  tags: ['admin:audit'],
  expose: true,
  scopes: ['admin:audit:read'],
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
    // A verifier that throws cannot vouch for the trail, so it reads as not intact.
    const verified = audit.verify
      ? await audit.verify().catch((error) => {
          logger?.warn?.('audit verify failed', error)
          return { intact: false, checked: 0 }
        })
      : undefined
    const users = await resolveAuditUsers(
      auth,
      events.map((event) => event.userIdentity?.userId),
      logger
    )
    return {
      events,
      users,
      nextCursor,
      readable: true,
      ...(verified && { intact: verified.intact }),
    }
  },
})
