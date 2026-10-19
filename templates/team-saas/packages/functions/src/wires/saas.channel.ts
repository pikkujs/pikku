import {
  wireChannel,
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
} from '#pikku/channel/pikku-channel-types.gen.js'

export const onConnect = pikkuChannelConnectionFunc(
  async ({ logger }, _, { channel }) => {
    logger.info({ event: 'board_connected', channelId: channel.channelId })
  }
)

export const onDisconnect = pikkuChannelDisconnectionFunc(
  async ({ logger }, _, { channel }) => {
    logger.info({ event: 'board_disconnected', channelId: channel.channelId })
  }
)

/**
 * The live board.
 *
 * Subscription is per organisation, and that is a tenancy boundary as much as
 * any database filter: a topic keyed on something broader would deliver one
 * customer's issue titles into another customer's open tab, which no amount of
 * query filtering downstream would undo.
 */
// @snippet start wireChannel
export const watchOrg = pikkuChannelFunc<{ orgId: string }, void>(
  async ({ kysely, eventHub }, { orgId }, { channel, session }) => {
    // Membership is re-checked at subscribe time. A channel outlives the
    // request that opened it, so "was a member when they connected" is the only
    // thing an earlier HTTP check could have established.
    const member = await kysely
      .selectFrom('membership')
      .select('membershipId')
      .where('orgId', '=', orgId)
      .where('userId', '=', session!.userId)
      .executeTakeFirst()

    if (!member) return

    await eventHub?.subscribe(`org:${orgId}`, channel.channelId)
  }
)

wireChannel({
  name: 'board',
  route: '/board',
  auth: true,
  onConnect,
  onDisconnect,
  onMessageWiring: {
    action: {
      watchOrg,
    },
  },
})
// @snippet end wireChannel
