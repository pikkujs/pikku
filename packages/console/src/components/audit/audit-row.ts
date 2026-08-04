import type { FlattenedRPCMap } from '../../pikku/rpc-map.gen.d'

/** A page of the trail exactly as `console:getAudits` returns it. */
export type AuditPage = FlattenedRPCMap['console:getAudits']['output']

/**
 * One row of the audit trail.
 *
 * Read off the generated RPC map rather than re-declared, so the row type is
 * the wire contract itself: the sink writes an `AuditEvent`, `getAudits`
 * returns it, and the console renders whatever that says. A local copy would
 * compile happily while the backend moved on.
 */
export type AuditRow = AuditPage['events'][number]

/** Who the actor ids on a page belong to, keyed by id. */
export type AuditActorDirectory = AuditPage['actors']

/** One entry of the actor filter's vocabulary. */
export type AuditActor =
  FlattenedRPCMap['console:getAuditFilters']['output']['actors'][number]

/**
 * What to call an actor.
 *
 * A name if the account has one, else the email, else nothing — the caller
 * decides what an unnamed actor looks like, because the table falls back to the
 * id while a filter option falls back to its own label.
 */
export const actorName = (actor?: {
  name?: string
  email?: string
}): string | undefined => actor?.name || actor?.email

/**
 * The label for an actor id, given the directory that came with the page.
 *
 * Falls back to the id: an account deleted since the event still has its
 * actions in the trail, and showing the id it was recorded under is the honest
 * answer — the alternative is an event that appears to have no author.
 */
export const actorLabel = (
  userId: string,
  directory: AuditActorDirectory | undefined
): string => actorName(directory?.[userId]) ?? userId

/**
 * Who a row says acted, in the order the trail can actually vouch for.
 *
 * A signed-in account first. Failing that, `pikkuUserId` — the identity pikku
 * resolves for every wire, which is all an unauthenticated caller leaves
 * behind; showing it as `system` would credit a stranger's action to the
 * platform itself. Only an event with neither is genuinely the system acting:
 * a cron or a queue worker, which have no session by design.
 */
export type ActorIdentity =
  | { kind: 'user'; label: string; synthetic: boolean }
  | { kind: 'anonymous'; label: string }
  | { kind: 'system' }

export const actorIdentity = (
  actor: AuditRow['actor'],
  directory: AuditActorDirectory | undefined
): ActorIdentity => {
  if (actor?.userId) {
    return {
      kind: 'user',
      label: actorLabel(actor.userId, directory),
      synthetic: directory?.[actor.userId]?.synthetic === true,
    }
  }
  if (actor?.pikkuUserId) {
    return { kind: 'anonymous', label: actor.pikkuUserId }
  }
  return { kind: 'system' }
}

/**
 * Outcome badge colours. Anything an application invents beyond these three
 * renders grey rather than being dropped — an unrecognised outcome is still
 * something the reader needs to see.
 */
export const OUTCOME_COLOUR: Record<string, string> = {
  success: 'green',
  failed: 'red',
  denied: 'orange',
}

/**
 * A stable React key.
 *
 * `eventId` is the audit table's primary key, so it is the right answer when
 * present. Rows written by a sink that does not set one fall back to the
 * timestamp plus the index within its page — deliberately not the index alone,
 * which would be reused by the next page and remount every row below it.
 */
export const auditRowKey = (row: AuditRow, index: number): string =>
  row.eventId ?? `${row.occurredAt}:${row.type}:${index}`

/**
 * The timestamp in the reader's own locale and zone.
 *
 * Audit rows are stored as ISO 8601 UTC; showing that verbatim asks whoever is
 * reading to do the conversion themselves, which is exactly when a reader
 * mis-reads when something happened. An unparseable value is shown as-is rather
 * than as "Invalid Date" — the raw text is at least evidence.
 */
export const formatOccurredAt = (occurredAt: string): string => {
  const at = new Date(occurredAt)
  if (Number.isNaN(at.getTime())) {
    return occurredAt
  }
  return at.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}

/**
 * A one-line reading of the event's metadata for the table's last column.
 *
 * Scalars only: a nested object or array is rendered as its type rather than
 * stringified, because a JSON blob flattened into a table cell is unreadable at
 * this width and the full event is available by other means.
 */
export const summariseMetadata = (metadata: unknown): string => {
  if (metadata == null) {
    return ''
  }
  if (typeof metadata !== 'object') {
    return String(metadata)
  }
  if (Array.isArray(metadata)) {
    return `${metadata.length} items`
  }
  return Object.entries(metadata as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${summariseValue(value)}`)
    .join(', ')
}

const summariseValue = (value: unknown): string => {
  if (value == null) {
    return '—'
  }
  if (Array.isArray(value)) {
    return `[${value.length}]`
  }
  if (typeof value === 'object') {
    return '{…}'
  }
  return String(value)
}
