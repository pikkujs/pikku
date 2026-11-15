import {
  defineChannelRoutes,
  wireChannel,
  pikkuChannelConnectionFunc,
} from '#pikku/channel/pikku-channel-types.gen.js'
import { pikkuSubscribeFunc } from '#pikku/function'
import { currentCompanyId } from '../lib/tenant.js'

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

/**
 * The company comes from the session, never from the client: a dispatcher
 * names no board, so there is no id to swap for another tenant's. A channel
 * leaves the board on disconnect, which is why there is no unwatch.
 */
export const watchBoard = pikkuSubscribeFunc<void, `board:${string}`>({
  scopes: ['jobs:read'],
  func: async ({ kysely }, _data, { session }) =>
    `board:${await currentCompanyId(kysely, session.userId)}`,
})

wireChannel({
  name: 'dispatch-board',
  route: '/board',
  auth: true,
  onConnect,
  onMessageWiring: {
    type: defineChannelRoutes({
      watch: watchBoard,
    }),
  },
})
