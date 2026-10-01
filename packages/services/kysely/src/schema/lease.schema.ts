import type { PikkuSchema } from './pikku-schema.types.js'

export const leaseSchema: PikkuSchema = {
  name: 'lease',
  ownedBy: ['leaseService', 'workflowService'],
  statements: [
    (db, _types, ctx) =>
      db.schema
        .createTable('pikkuLease')
        .addColumn('key', ctx.key, (col) => col.primaryKey())
        .addColumn('holder', ctx.text, (col) => col.notNull())
        .addColumn('token', 'integer', (col) => col.notNull())
        .addColumn('expiresAt', 'bigint', (col) => col.notNull()),
  ],
}
