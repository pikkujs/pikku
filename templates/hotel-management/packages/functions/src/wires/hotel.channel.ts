import {
  wireChannel,
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
} from '#pikku/channel/pikku-channel-types.gen.js'

export const onConnect = pikkuChannelConnectionFunc(
  async ({ logger }, _, { channel }) => {
    logger.info({ event: 'frontdesk_connected', channelId: channel.channelId })
  }
)

export const onDisconnect = pikkuChannelDisconnectionFunc(
  async ({ logger }, _, { channel }) => {
    logger.info({ event: 'frontdesk_disconnected', channelId: channel.channelId })
  }
)

/**
 * The front-desk board.
 *
 * A receptionist checking somebody in needs to know the moment 204 goes clean.
 * Polling gets that wrong in both directions — too slow when it matters, and
 * constant load when nothing is happening — so housekeeping publishes and the
 * desk subscribes.
 */
// @snippet start wireChannel
export const watchHousekeeping = pikkuChannelFunc<void, void>(
  async ({ eventHub }, _data, { channel }) => {
    await eventHub?.subscribe('housekeeping', channel.channelId)
  }
)

wireChannel({
  name: 'front-desk',
  route: '/front-desk',
  auth: true,
  onConnect,
  onDisconnect,
  onMessageWiring: {
    action: {
      watchHousekeeping,
    },
  },
})
// @snippet end wireChannel
