import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/** Server-side session storage. */
export const sessionSchema: PikkuSchema = {
  name: 'session',
  statements: [
    (db, _types, ctx) =>
      db.schema
        .createTable('pikkuUserSessions')
        .addColumn('pikkuUserId', ctx.key, (col) => col.primaryKey())
        .addColumn('session', ctx.text, (col) => col.notNull())
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),
  ],
}
