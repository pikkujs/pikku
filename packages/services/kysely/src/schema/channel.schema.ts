import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/** Channels and their topic subscriptions, also read by the event-hub store. */
export const channelSchema: PikkuSchema = {
  name: 'channel',
  wiredBy: 'channel',
  statements: [
    (db) =>
      db.schema
        .createTable('channels')
        .addColumn('channelId', 'text', (col) => col.primaryKey())
        .addColumn('channelName', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('openingData', 'text', (col) =>
          col.notNull().defaultTo('{}')
        )
        .addColumn('pikkuUserId', 'text')
        .addColumn('state', 'text')
        .addColumn('lastWire', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createTable('channelSubscriptions')
        .addColumn('channelId', 'text', (col) =>
          col.notNull().references('channels.channelId').onDelete('cascade')
        )
        .addColumn('topic', 'text', (col) => col.notNull())
        .addPrimaryKeyConstraint('channel_subscriptions_pk', [
          'channelId',
          'topic',
        ]),
  ],
}
