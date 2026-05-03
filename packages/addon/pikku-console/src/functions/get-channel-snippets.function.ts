import { pikkuSessionlessFunc } from '#pikku'
import type { ChannelMeta } from '@pikku/core/channel'
import type { ChannelSnippets } from '../services/wiring.service.js'

export const getChannelSnippets = pikkuSessionlessFunc<
  { channelName: string },
  ChannelSnippets
>({
  title: 'Get Channel Snippets',
  description:
    'Given a channelName, reads channel metadata from metaService, finds the matching channel, and generates code snippets (overview, handlers, actions) for that channel. Returns empty snippets if the channel is not found.',
  expose: true,
  auth: false,
  func: async ({ metaService, wiringService }, { channelName }) => {
    const channels = await metaService.getChannelsMeta()
    const channel: ChannelMeta | undefined = channels[channelName]
    if (!channel) return { overview: '', handlers: {}, actions: {} }
    return wiringService.generateChannelSnippets(channelName, channel)
  },
})
