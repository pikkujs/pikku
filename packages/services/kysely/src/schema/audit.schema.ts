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
  tables: {
    audit: {
      columns: {
        auditId: { type: 'key', primaryKey: true },
        occurredAt: { type: 'key', required: true },
        type: { type: 'key', required: true },
        source: { type: 'text', required: true, default: 'auto' },
        outcome: { type: 'text' },
        functionId: { type: 'text' },
        wireType: { type: 'text' },
        traceId: { type: 'text' },
        transactionId: { type: 'text' },
        queryId: { type: 'text' },
        userId: { type: 'key' },
        orgId: { type: 'text' },
        pikkuUserId: { type: 'text' },
        tables: { type: 'text' },
        changedCols: { type: 'text' },
        event: { type: 'text' },
        old: { type: 'text' },
        data: { type: 'text' },
      },
      // The trail is only ever read newest-first, and the two filters the
      // console offers are user and type.
      indexes: [
        { name: 'idx_audit_occurred_at', columns: ['occurredAt'] },
        { name: 'idx_audit_user_id', columns: ['userId'] },
        { name: 'idx_audit_type', columns: ['type'] },
      ],
    },
  },
}
