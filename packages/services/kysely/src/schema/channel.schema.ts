import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/** Channels and their topic subscriptions, also read by the event-hub store. */
export const channelSchema: PikkuSchema = {
  name: 'channel',
  ownedBy: ['channelStore', 'eventHub'],
  statements: [
    (db, _types, ctx) =>
      db.schema
        .createTable('channels')
        .addColumn('channelId', ctx.key, (col) => col.primaryKey())
        .addColumn('channelName', ctx.text, (col) => col.notNull())
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('openingData', ctx.text, (col) =>
          col.notNull().defaultTo(ctx.defaultText('{}'))
        )
        .addColumn('pikkuUserId', ctx.text)
        .addColumn('state', ctx.text)
        .addColumn('lastWire', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db, _types, ctx) =>
      db.schema
        .createTable('channelSubscriptions')
        .addColumn('channelId', ctx.key, (col) =>
          ctx.references(col.notNull(), 'channels.channelId')
        )
        .addColumn('topic', ctx.key, (col) => col.notNull())
        .addPrimaryKeyConstraint('channel_subscriptions_pk', [
          'channelId',
          'topic',
        ])
        .$call(
          ctx.foreignKeys('channelSubscriptions', {
            channelId: 'channels.channelId',
          })
        ),
  ],
}
