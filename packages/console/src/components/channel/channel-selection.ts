import { decodePanelHash } from '../../lib/panel-url'

export type ChannelSelection =
  | { type: 'handler'; handler: string }
  | { type: 'action'; category: string; action: string }
  | null

export interface ChannelRoute {
  channelName: string
  selected: ChannelSelection
}

/**
 * The channels tab addresses itself the same way every other list does — the
 * open row in the fragment — but its row is two levels deep, so the fragment
 * names both: `#chat` for the channel, `#chat/connect` for one of its handlers,
 * `#chat/messages/send` for one action. A `channel:` prefix is accepted so a
 * link built by `panelHref` from another page lands here.
 */
export const parseChannelRoute = (hash: string): ChannelRoute | null => {
  const target = decodePanelHash(hash)
  if (!target || (target.type && target.type !== 'channel')) return null
  const [channelName, ...rest] = target.id.split('/')
  if (!channelName) return null
  if (rest.length === 1) {
    return { channelName, selected: { type: 'handler', handler: rest[0]! } }
  }
  if (rest.length === 2) {
    return {
      channelName,
      selected: { type: 'action', category: rest[0]!, action: rest[1]! },
    }
  }
  return { channelName, selected: null }
}

export const formatChannelRoute = ({
  channelName,
  selected,
}: ChannelRoute): string => {
  if (!channelName) return ''
  if (selected?.type === 'handler') {
    return `${channelName}/${selected.handler}`
  }
  if (selected?.type === 'action') {
    return `${channelName}/${selected.category}/${selected.action}`
  }
  return channelName
}
