import type { PikkuSchema } from './pikku-schema.types.js'

export const lockSchema: PikkuSchema = {
  name: 'lock',
  ownedBy: ['lockService'],
  statements: [
    (db) =>
      db.schema
        .createTable('pikkuLock')
        .addColumn('key', 'text', (col) => col.primaryKey())
        .addColumn('holder', 'text', (col) => col.notNull())
        .addColumn('token', 'integer', (col) => col.notNull())
        .addColumn('expiresAt', 'bigint', (col) => col.notNull()),
  ],
}
