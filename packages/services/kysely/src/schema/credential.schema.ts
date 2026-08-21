import { sql } from 'kysely'
import { rawStatement, type PikkuSchema } from './pikku-schema.types.js'

/**
 * Encrypted per-user credentials and their audit trail.
 *
 * The uniqueness rule is an expression index — `user_id` is nullable and two
 * rows with a null user must still collide on name — which the schema builder
 * cannot express, so it stays raw. Raw SQL is not rewritten by `withSchema`,
 * which is why the table goes through `ctx.table` rather than being left to the
 * search path. The index's own name stays unqualified: an index belongs to the
 * schema of the table it is on, and postgres rejects one that says otherwise.
 */
export const credentialSchema: PikkuSchema = {
  name: 'credential',
  ownedBy: ['credentialService'],
  statements: [
    (db) =>
      db.schema
        .createTable('credentials')
        .addColumn('name', 'varchar(255)', (col) => col.notNull())
        .addColumn('userId', 'varchar(255)')
        .addColumn('ciphertext', 'text', (col) => col.notNull())
        .addColumn('wrappedDek', 'text', (col) => col.notNull())
        .addColumn('keyVersion', 'integer', (col) => col.notNull())
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    rawStatement(
      ({ table }) =>
        sql`CREATE UNIQUE INDEX credentials_name_user_id_unique ON ${table('credentials')} (name, COALESCE(user_id, ''))`
    ),

    (db) =>
      db.schema
        .createTable('credentialKekSalts')
        .addColumn('keyVersion', 'integer', (col) => col.primaryKey())
        .addColumn('salt', 'varchar(64)', (col) => col.notNull())
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createTable('credentialsAudit')
        .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('credentialName', 'varchar(255)', (col) => col.notNull())
        .addColumn('userId', 'varchar(255)')
        .addColumn('action', 'varchar(20)', (col) => col.notNull())
        .addColumn('performedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),
  ],
}
