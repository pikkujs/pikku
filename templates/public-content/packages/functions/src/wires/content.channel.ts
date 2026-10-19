import {
  wireChannel,
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
} from '#pikku/channel/pikku-channel-types.gen.js'

export const onConnect = pikkuChannelConnectionFunc(
  async ({ logger }, _, { channel }) => {
    logger.info({ event: 'editorial_connected', channelId: channel.channelId })
  }
)

export const onDisconnect = pikkuChannelDisconnectionFunc(
  async ({ logger }, _, { channel }) => {
    logger.info({ event: 'editorial_disconnected', channelId: channel.channelId })
  }
)

/**
 * The editorial channel, and note `auth: true`.
 *
 * The public side of this product has no channel at all. A live feed for
 * anonymous readers would be a standing connection per visitor for content that
 * changes a few times a day — the wrong tool, and an easy way to turn a traffic
 * spike into a connection-count incident.
 */
// @snippet start wireChannel
export const watchEditorial = pikkuChannelFunc<void, void>(
  async ({ eventHub }, _data, { channel }) => {
    await eventHub?.subscribe('editorial', channel.channelId)
  }
)

wireChannel({
  name: 'editorial',
  route: '/editorial',
  auth: true,
  onConnect,
  onDisconnect,
  onMessageWiring: {
    action: {
      watchEditorial,
    },
  },
})
// @snippet end wireChannel
