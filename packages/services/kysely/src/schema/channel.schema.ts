import type { PikkuSchema } from './pikku-schema.types.js'

/** Channels and their topic subscriptions, also read by the event-hub store. */
export const channelSchema: PikkuSchema = {
  name: 'channel',
  ownedBy: ['channelStore', 'eventHub'],
  tables: {
    channels: {
      columns: {
        channelId: { type: 'key', primaryKey: true },
        channelName: { type: 'text', required: true },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
        openingData: { type: 'text', required: true, default: '{}' },
        traceparent: { type: 'text' },
        pikkuUserId: { type: 'text' },
        state: { type: 'text' },
        lastWire: { type: 'timestamp', required: true, default: { now: true } },
      },
    },
    channelSubscriptions: {
      columns: {
        channelId: {
          type: 'key',
          required: true,
          references: 'channels.channelId',
          onDelete: 'cascade',
        },
        topic: { type: 'key', required: true },
      },
      primaryKey: ['channelId', 'topic'],
    },
  },
}
