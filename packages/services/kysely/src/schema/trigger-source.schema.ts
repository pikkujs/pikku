import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * What each declared trigger source registered with its provider. `state` holds provider identifiers only: a signing secret a
 * provider issues goes to the credential service.
 */
export const triggerSourceSchema: PikkuSchema = {
  name: 'trigger-source',
  ownedBy: ['triggerSourceStore'],
  statements: [
    (db, _types, ctx) =>
      db.schema
        .createTable('pikkuTriggerSource')
        .addColumn('name', ctx.key, (col) => col.primaryKey())
        .addColumn('kind', ctx.text, (col) => col.notNull())
        .addColumn('baseUrl', ctx.text)
        .addColumn('labelPrefix', ctx.text)
        .addColumn('declared', 'boolean', (col) =>
          col.defaultTo(true).notNull()
        )
        .addColumn('enabled', 'boolean', (col) =>
          col.defaultTo(false).notNull()
        )
        .addColumn('status', ctx.text)
        .addColumn('state', ctx.text)
        .addColumn('detail', ctx.text)
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),
  ],
}
