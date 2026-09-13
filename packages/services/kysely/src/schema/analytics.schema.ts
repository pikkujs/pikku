import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * The `pikkuAnalyticsEvents` table {@link KyselyAnalyticsService} appends to.
 *
 * Gated by `ownedBy` so it arrives only for a project that declares events: a
 * database that measures nothing should not carry a table for it.
 *
 * Every column is text, and `occurredAt` is an ISO 8601 string rather than a
 * timestamp, for the same reason the audit trail is: a warehouse loader reading
 * these rows has no shared type to agree on, and string ordering of ISO 8601 is
 * chronological ordering.
 *
 * The identity is spread across columns rather than left inside the JSON
 * because it is what every query groups by — one visitor's funnel, one org's
 * usage — while `props` differs per event and is only ever read back whole.
 */
export const analyticsSchema: PikkuSchema = {
  name: 'analytics',
  ownedBy: ['analyticsService'],
  statements: [
    (db) =>
      db.schema
        .createTable('pikkuAnalyticsEvents')
        .addColumn('eventId', 'text', (col) => col.primaryKey())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('occurredAt', 'text', (col) => col.notNull())
        .addColumn('source', 'text', (col) => col.notNull())
        .addColumn('functionId', 'text')
        .addColumn('wireType', 'text')
        .addColumn('traceId', 'text')
        .addColumn('userId', 'text')
        .addColumn('orgId', 'text')
        .addColumn('pikkuUserId', 'text')
        // The device id for a visitor with no session. Its own column beside
        // `userId` and not folded into it: the whole point of the anonymous id
        // is the traffic that has no user to be attributed to yet.
        .addColumn('anonymousId', 'text')
        .addColumn('vendorIds', 'text')
        .addColumn('consent', 'text')
        .addColumn('props', 'text'),

    (db) =>
      db.schema
        .createIndex('idx_pikku_analytics_events_occurred_at')
        .on('pikkuAnalyticsEvents')
        .column('occurredAt'),

    (db) =>
      db.schema
        .createIndex('idx_pikku_analytics_events_name')
        .on('pikkuAnalyticsEvents')
        .column('name'),
  ],
}
