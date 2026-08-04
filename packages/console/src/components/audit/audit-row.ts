import type { AuditEvent } from '@pikku/core'

/**
 * One row of the audit trail.
 *
 * `AuditEvent` is the shape the whole chain already agrees on — the sink writes
 * it, `AuditService.query` returns it, and `console:getAudits` passes it
 * through. Re-declaring it here would be a second source of truth that compiles
 * happily while the backend moves on, so the alias is deliberate: the console
 * renders whatever core says an event is.
 */
export type AuditRow = AuditEvent

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
