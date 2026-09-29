import type { PikkuSchema } from './pikku-schema.types.js'

/** One row per lock key; a released or lapsed lease stays so its token keeps rising. */
export const lockSchema: PikkuSchema = {
  name: 'lock',
  ownedBy: ['lockService', 'workflowService'],
  statements: [
    (db) =>
      db.schema
        .createTable('pikkuLock')
        .addColumn('key', 'text', (col) => col.primaryKey())
        .addColumn('holder', 'text', (col) => col.notNull())
        .addColumn('token', 'integer', (col) => col.notNull())
        .addColumn('expiresAt', 'timestamp', (col) => col.notNull()),
  ],
}
