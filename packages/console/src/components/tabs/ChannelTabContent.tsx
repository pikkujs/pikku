import React, { useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from '../../router'
import { Box } from '@mantine/core'
import { Radio } from 'lucide-react'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { PanelProvider } from '../../context/PanelContext'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import {
  ChannelNavTree,
  type ChannelSelection,
} from '../channel/ChannelNavTree'
import { ChannelDetailView } from '../channel/ChannelDetailView'
import type { ChannelMeta } from '@pikku/core/channel'
import styles from '../ui/console.module.css'

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
    <Box className={styles.flexRow}>
      <Box
        className={`${styles.listPaneFixed} ${styles.flexColumn}`}
        style={{ width: 280, minWidth: 220 }}
      >
        <ChannelNavTree
          channelName={channelName}
          channel={channelMeta}
          allChannelsMeta={allChannelsMeta}
          selected={selected}
          onSelect={setSelected}
          onChannelSwitch={handleChannelSwitch}
          searchQuery={searchQuery}
        />
      </Box>
      <Box className={`${styles.detailPane} ${styles.overflowHidden}`}>
        <ChannelDetailView
          channelName={channelName}
          channel={channelMeta}
          selected={selected}
        />
      </Box>
    </Box>
  )
}

type ChannelTabContentProps = { searchQuery: string }

export const ChannelTabContent: React.FC<ChannelTabContentProps> = ({ searchQuery }) => {
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
