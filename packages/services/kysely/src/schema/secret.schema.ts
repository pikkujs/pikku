import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * Encrypted secrets and their audit trail.
 *
 * The audit table is declared unconditionally, where `init()` created it only
 * when the service was constructed with auditing on. A migration cannot depend
 * on runtime configuration, and the asymmetry favours declaring it: an unused
 * table costs nothing, while turning auditing on against a database that never
 * got the table fails on the first write.
 */
export const secretSchema: PikkuSchema = {
  name: 'secret',
  statements: [
    (db) =>
      db.schema
        .createTable('secrets')
        .addColumn('key', 'varchar(255)', (col) => col.primaryKey())
        .addColumn('ciphertext', 'text', (col) => col.notNull())
        .addColumn('wrappedDek', 'text', (col) => col.notNull())
        .addColumn('keyVersion', 'integer', (col) => col.notNull())
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createTable('secretKekSalts')
        .addColumn('keyVersion', 'integer', (col) => col.primaryKey())
        .addColumn('salt', 'varchar(64)', (col) => col.notNull())
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createTable('secretsAudit')
        .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('secretKey', 'varchar(255)', (col) => col.notNull())
        .addColumn('action', 'varchar(20)', (col) => col.notNull())
        .addColumn('performedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),
  ],
}
