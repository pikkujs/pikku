import {
  wireChannel,
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
} from '#pikku/channel/pikku-channel-types.gen.js'

export const onConnect = pikkuChannelConnectionFunc(
  async ({ logger }, _, { channel }) => {
    logger.info({ event: 'run_watch_connected', channelId: channel.channelId })
  }
)

export const onDisconnect = pikkuChannelDisconnectionFunc(
  async ({ logger }, _, { channel }) => {
    logger.info({ event: 'run_watch_disconnected', channelId: channel.channelId })
  }
)

/**
 * The live run log.
 *
 * Watching a run finish is the single most common thing anyone does in an
 * automation tool, and polling is the wrong shape for it twice over: too slow
 * to feel live, and constant load when nothing is running. The engine publishes
 * a step event as each node finishes and the UI subscribes to one run.
 *
 * Subscribing per run rather than to a firehose is deliberate — an operator
 * watching one failure should not receive every step of every other run.
 */
// @snippet start wireChannel
export const watchRun = pikkuChannelFunc<{ runId: string }, void>(
  async ({ eventHub }, { runId }, { channel }) => {
    await eventHub?.subscribe(`run:${runId}`, channel.channelId)
  }
)

wireChannel({
  name: 'runs',
  route: '/runs',
  auth: true,
  onConnect,
  onDisconnect,
  onMessageWiring: {
    action: {
      watchRun,
    },
  },
})
// @snippet end wireChannel
