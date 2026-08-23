import {
  defineChannelRoutes,
  wireChannel,
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
} from '#pikku/channel/pikku-channel-types.gen.js'
import { pikkuFunc } from '#pikku/function'

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
export const subscribeToOrder = pikkuChannelFunc<{ orderId: string }, void>(
  async ({ eventHub }, { orderId }, { channel }) => {
    await eventHub?.subscribe(`order:${orderId}`, channel.channelId)
  }
)

export const unsubscribeFromOrder = pikkuChannelFunc<{ orderId: string }, void>(
  async ({ eventHub }, { orderId }, { channel }) => {
    await eventHub?.unsubscribe(`order:${orderId}`, channel.channelId)
  }
)
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
      unsubscribe: unsubscribeFromOrder,
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

    await eventHub?.publish(`order:${orderId}`, null, {
      orderId,
      status: 'shipped',
    })
  },
})
// @snippet end channelPubSub
