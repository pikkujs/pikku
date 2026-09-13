import React, { useCallback, useMemo } from 'react'
import { useUrlHash } from '../../hooks/useUrlHash'
import { encodePanelHash } from '../../lib/panel-url'
import { formatChannelRoute, parseChannelRoute } from './channel-selection'
import { ChannelNavTree, type ChannelSelection } from './ChannelNavTree'
import { ChannelDetailView } from './ChannelDetailView'
import { ListDetailLayout } from '../ui/ListDetailLayout'
import type { ChannelMeta } from '@pikku/core/channel'

export interface ChannelWorkspaceProps {
  channelName: string
  channelMeta: ChannelMeta
  allChannelsMeta: Record<string, ChannelMeta>
  searchQuery: string
}

/** One channel's handler tree beside the detail for whatever it has selected. */
export const ChannelWorkspace: React.FC<ChannelWorkspaceProps> = ({
  channelName,
  channelMeta,
  allChannelsMeta,
  searchQuery,
}) => {
  const [hash, setHash] = useUrlHash()

  const selected = useMemo(
    () => parseChannelRoute(hash)?.selected ?? null,
    [hash]
  )

  const writeRoute = useCallback(
    (name: string, next: ChannelSelection) => {
      setHash(
        encodePanelHash(
          'channel',
          formatChannelRoute({ channelName: name, selected: next }),
          true
        ) ?? ''
      )
    },
    [setHash]
  )

  const handleSelect = useCallback(
    (next: ChannelSelection) => writeRoute(channelName, next),
    [channelName, writeRoute]
  )

  // Switching channel drops the handler selected in the old one — the fragment
  // names a row inside a channel, and that row does not exist in the next.
  const handleChannelSwitch = useCallback(
    (name: string) => writeRoute(name, null),
    [writeRoute]
  )

  return (
    <ListDetailLayout
      listWidth={320}
      list={
        <ChannelNavTree
          channelName={channelName}
          channel={channelMeta}
          allChannelsMeta={allChannelsMeta}
          selected={selected}
          onSelect={handleSelect}
          onChannelSwitch={handleChannelSwitch}
          searchQuery={searchQuery}
        />
      }
      detail={
        <ChannelDetailView
          channelName={channelName}
          channel={channelMeta}
          selected={selected}
        />
      }
      hasSelection={true}
    />
  )
}
