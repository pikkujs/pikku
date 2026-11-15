import {
  defineChannelRoutes,
  wireChannel,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
} from '#pikku/channel/pikku-channel-types.gen.js'
import { pikkuFunc, pikkuSubscribeFunc } from '#pikku/function'
import { isOrderOwner } from './shop.security.js'

// @snippet start channelLifecycle
export const onConnect = pikkuChannelConnectionFunc(
  async ({ logger }, _, { channel }) => {
    logger.info({ event: 'ws_connected', channelId: channel.channelId })
  }
)

export const onDisconnect = pikkuChannelDisconnectionFunc(
  async ({ logger }, _, { channel }) => {
    logger.info({ event: 'ws_disconnected', channelId: channel.channelId })
  }
)
// @snippet end channelLifecycle

// @snippet start orderStatusChannel
// @snippet start wireChannel
// The function returns the topic, so a client can only follow an order the
// permission lets it see. A channel leaves the topic on disconnect.
export const subscribeToOrder = pikkuSubscribeFunc<
  { orderId: string },
  `order:${string}`
>({
  scopes: ['orders:read'],
  permissions: { owner: isOrderOwner },
  func: async (_services, { orderId }) => `order:${orderId}`,
})
// @snippet end wireChannel
// @snippet end orderStatusChannel

// @snippet start channelWiring
wireChannel({
  name: 'order-status',
  route: '/orders/status',
  auth: true,
  onConnect,
  onDisconnect,
  onMessageWiring: {
    // @snippet start channelRoutes
    type: defineChannelRoutes({
      subscribe: subscribeToOrder,
    }),
    // @snippet end channelRoutes
  },
})
// @snippet end channelWiring

// @snippet start channelPubSub
// Publish from any HTTP handler to all WebSocket clients subscribed to that order.
// @coverage-unreachable the server-side push half of the order channel; it runs when the app pushes, not when anything calls it
export const notifyOrderShipped = pikkuFunc<{ orderId: string }, void>({
  func: async ({ eventHub, kysely }, { orderId }) => {
    await kysely
      .updateTable('order')
      .set({ status: 'shipped', updatedAt: new Date().toISOString() })
      .where('orderId', '=', orderId)
      .execute()

    await eventHub?.publish(`order:${orderId}`, {
      orderId,
      status: 'shipped',
    })
  },
})
// @snippet end channelPubSub
