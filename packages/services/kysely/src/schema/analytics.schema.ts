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
    (db, _types, ctx) =>
      db.schema
        .createTable('pikkuAnalyticsEvents')
        .addColumn('eventId', ctx.key, (col) => col.primaryKey())
        .addColumn('name', ctx.key, (col) => col.notNull())
        .addColumn('occurredAt', ctx.key, (col) => col.notNull())
        .addColumn('source', ctx.text, (col) => col.notNull())
        .addColumn('functionId', ctx.text)
        .addColumn('wireType', ctx.text)
        .addColumn('traceId', ctx.text)
        .addColumn('userId', ctx.text)
        .addColumn('orgId', ctx.text)
        .addColumn('pikkuUserId', ctx.text)
        // The device id for a visitor with no session. Its own column beside
        // `userId` and not folded into it: the whole point of the anonymous id
        // is the traffic that has no user to be attributed to yet.
        .addColumn('anonymousId', ctx.text)
        .addColumn('vendorIds', ctx.text)
        .addColumn('consent', ctx.text)
        .addColumn('props', ctx.text),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_pikku_analytics_events_occurred_at')
        .on('pikkuAnalyticsEvents')
        .column('occurredAt'),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_pikku_analytics_events_name')
        .on('pikkuAnalyticsEvents')
        .column('name'),
  ],
}
