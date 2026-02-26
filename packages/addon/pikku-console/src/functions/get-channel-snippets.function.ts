import { pikkuSessionlessFunc } from '#pikku'
import type { ChannelSnippets } from '../services/wiring.service.js'

export const getChannelSnippets = pikkuSessionlessFunc<
  { channelName: string },
  ChannelSnippets
>({
  title: 'Get Channel Snippets',
  description:
    'Given a channelName, reads channel metadata from wiringService, finds the matching channel, and generates code snippets (overview, handlers, actions) for that channel. Returns empty snippets if the channel is not found.',
  expose: true,
  auth: false,
  func: async ({ wiringService }, { channelName }) => {
    const channels = await wiringService.readChannelsMeta()
    const channel = (channels as Record<string, any>)[channelName]
    if (!channel) return { overview: '', handlers: {}, actions: {} }
    return wiringService.generateChannelSnippets(channelName, channel)
  },
})
