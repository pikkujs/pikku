import type { PikkuSchema } from './pikku-schema.types.js'

export const leaseSchema: PikkuSchema = {
  name: 'lease',
  ownedBy: ['leaseService', 'workflowService'],
  statements: [
    (db) =>
      db.schema
        .createTable('pikkuLease')
        .addColumn('key', 'text', (col) => col.primaryKey())
        .addColumn('holder', 'text', (col) => col.notNull())
        .addColumn('token', 'integer', (col) => col.notNull())
        .addColumn('expiresAt', 'bigint', (col) => col.notNull()),
  ],
}
