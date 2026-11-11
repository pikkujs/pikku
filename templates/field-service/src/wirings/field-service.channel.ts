import {
  defineChannelRoutes,
  wireChannel,
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
} from '#pikku/channel/pikku-channel-types.gen.js'

/**
 * The dispatch board, live.
 *
 * A dispatcher and three technicians look at the same jobs all day, so a board
 * that only updates on refresh shows four people four different versions of the
 * morning. One topic per company: subscribing by tenant is what stops a socket
 * becoming the hole the HTTP routes carefully do not have.
 */
export const onConnect = pikkuChannelConnectionFunc(
  async ({ logger }, _data, { channel }) => {
    logger.info({ event: 'board_connected', channelId: channel.channelId })
  }
)

export const watchBoard = pikkuChannelFunc<{ companyId: string }, void>(
  async ({ eventHub }, { companyId }, { channel }) => {
    await eventHub?.subscribe(`board:${companyId}`, channel.channelId)
  }
)

export const unwatchBoard = pikkuChannelFunc<{ companyId: string }, void>(
  async ({ eventHub }, { companyId }, { channel }) => {
    await eventHub?.unsubscribe(`board:${companyId}`, channel.channelId)
  }
)

wireChannel({
  name: 'dispatch-board',
  route: '/board',
  auth: true,
  onConnect,
  onMessageWiring: {
    type: defineChannelRoutes({
      watch: watchBoard,
      unwatch: unwatchBoard,
    }),
  },
})
