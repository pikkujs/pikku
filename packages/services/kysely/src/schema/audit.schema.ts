import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * The `audit` table {@link KyselyAuditService} writes to and reads back.
 *
 * Gated by `ownedBy` rather than written for everyone: only a project that has
 * wired a durable audit sink needs this table, and generating it for the rest
 * would put an empty table in every database. `KyselyAuditService.init()`
 * requires it and never creates it, so it arrives with the migration `pikku db
 * generate` writes for the sink that fills it.
 *
 * Every column is text on every engine, matching the platform audit-queue
 * consumer's row shape — a locally-run project and a deployed stage write rows
 * the same reader can read. `occurredAt` is an ISO 8601 string rather than a
 * timestamp for that reason: string ordering is chronological ordering, and the
 * queue consumer has no shared type to agree on.
 */
export const auditSchema: PikkuSchema = {
  name: 'audit',
  ownedBy: ['audit', 'auditLog'],
  statements: [
    (db) =>
      db.schema
        .createTable('audit')
        .addColumn('auditId', 'text', (col) => col.primaryKey())
        .addColumn('occurredAt', 'text', (col) => col.notNull())
        .addColumn('type', 'text', (col) => col.notNull())
        .addColumn('source', 'text', (col) => col.defaultTo('auto').notNull())
        .addColumn('outcome', 'text')
        .addColumn('functionId', 'text')
        .addColumn('wireType', 'text')
        .addColumn('traceId', 'text')
        .addColumn('transactionId', 'text')
        .addColumn('queryId', 'text')
        .addColumn('userId', 'text')
        .addColumn('orgId', 'text')
        .addColumn('pikkuUserId', 'text')
        .addColumn('tables', 'text')
        .addColumn('changedCols', 'text')
        .addColumn('event', 'text')
        .addColumn('old', 'text')
        .addColumn('data', 'text'),

    // The trail is only ever read newest-first, and the two filters the console
    // offers are user and type.
    (db) =>
      db.schema
        .createIndex('idx_audit_occurred_at')
        .on('audit')
        .column('occurredAt'),

    (db) =>
      db.schema.createIndex('idx_audit_user_id').on('audit').column('userId'),

    (db) => db.schema.createIndex('idx_audit_type').on('audit').column('type'),
  ],
}
