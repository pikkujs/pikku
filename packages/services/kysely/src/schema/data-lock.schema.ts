import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * Where the passphrase's salts and verifiers live.
 *
 * Deliberately the one table in a classified deployment that holds nothing
 * encrypted. It has to be readable before anything has been unlocked — a store
 * that needed its own key to find out how to open itself could never be opened
 * — and that costs nothing, because a salt and a verifier reveal no key
 * material.
 *
 * Losing this table is losing the data: every sealed row is opened by a KEK
 * derived from the salt kept here, so a deployment that ships without the
 * migration silently turns its own rows into noise the first time it restarts.
 */
export const dataLockSchema: PikkuSchema = {
  name: 'data-lock',
  ownedBy: ['dataLock'],
  statements: [
    (db) =>
      db.schema
        .createTable('dataLocks')
        .addColumn('keyId', 'varchar(255)', (col) => col.primaryKey())
        .addColumn('keyVersion', 'integer', (col) => col.notNull())
        .addColumn('salt', 'varchar(64)', (col) => col.notNull())
        .addColumn('verifier', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),
  ],
}
