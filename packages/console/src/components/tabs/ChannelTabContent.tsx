import React, { useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from '../../router'
import { Radio } from 'lucide-react'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { PanelProvider } from '../../context/PanelContext'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import {
  ChannelNavTree,
  type ChannelSelection,
} from '../channel/ChannelNavTree'
import { ChannelDetailView } from '../channel/ChannelDetailView'
import { ListDetailLayout } from '../ui/ListDetailLayout'
import type { ChannelMeta } from '@pikku/core/channel'

const ChannelTabInner: React.FC<{
  channelName: string
  channelMeta: ChannelMeta
  allChannelsMeta: Record<string, ChannelMeta>
  searchQuery: string
}> = ({ channelName, channelMeta, allChannelsMeta, searchQuery }) => {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<ChannelSelection>(null)

  const handleChannelSwitch = useCallback(
    (name: string) => {
      setSelected(null)
      navigate(`/apis?tab=channels&id=${encodeURIComponent(name)}`)
    },
    [navigate]
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
          onSelect={setSelected}
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

type ChannelTabContentProps = { searchQuery: string; emptyHero?: React.ReactNode }

export const ChannelTabContent: React.FC<ChannelTabContentProps> = ({ searchQuery, emptyHero }) => {
  const [searchParams] = useSearchParams()
  const channelName = searchParams.get('id') || ''
  const { meta } = usePikkuMeta()

  const allChannelsMeta = meta.channelsMeta || {}
  const channelNames = Object.keys(allChannelsMeta)
  const resolvedName = channelName || channelNames[0] || ''
  const channelMeta = allChannelsMeta[resolvedName]

  if (!channelMeta) {
    return (
      <EmptyStatePlaceholder
        icon={Radio}
        hero={emptyHero}
        title="No channels found"
        description="Define channels in your project using addChannel() to see them here."
        docsHref="https://pikku.dev/docs/core-features/channels"
      />
    )
  }

  return (
    <PanelProvider>
      <ChannelTabInner
        channelName={resolvedName}
        channelMeta={channelMeta}
        allChannelsMeta={allChannelsMeta}
        searchQuery={searchQuery}
      />
    </PanelProvider>
  )
}
