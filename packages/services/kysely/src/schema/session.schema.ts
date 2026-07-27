import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/** Server-side session storage. */
export const sessionSchema: PikkuSchema = {
  name: 'session',
  statements: [
    (db) =>
      db.schema
        .createTable('pikkuUserSessions')
        .addColumn('pikkuUserId', 'text', (col) => col.primaryKey())
        .addColumn('session', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),
  ],
}
