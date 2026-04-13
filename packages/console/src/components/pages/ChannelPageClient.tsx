import React, { useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from '../../router'
import { Box, Center, Text } from '@mantine/core'
import { PanelProvider } from '../../context/PanelContext'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import {
  ChannelNavTree,
  type ChannelSelection,
} from '../channel/ChannelNavTree'
import { ChannelDetailView } from '../channel/ChannelDetailView'
import type { ChannelMeta } from '@pikku/core/channel'

const ChannelPageInner: React.FunctionComponent<{
  channelName: string
  channelMeta: ChannelMeta
  allChannelsMeta: Record<string, ChannelMeta>
}> = ({ channelName, channelMeta, allChannelsMeta }) => {
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
    <Box style={{ display: 'flex', height: '100%' }}>
      <Box
        style={{
          width: 280,
          minWidth: 220,
          borderRight: '1px solid var(--app-row-border)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <ChannelNavTree
          channelName={channelName}
          channel={channelMeta}
          allChannelsMeta={allChannelsMeta}
          selected={selected}
          onSelect={setSelected}
          onChannelSwitch={handleChannelSwitch}
        />
      </Box>
      <Box style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <ChannelDetailView
          channelName={channelName}
          channel={channelMeta}
          selected={selected}
        />
      </Box>
    </Box>
  )
}

export const ChannelPageClient: React.FunctionComponent = () => {
  const [searchParams] = useSearchParams()
  const channelName = searchParams.get('id') || ''
  const { meta } = usePikkuMeta()

  const allChannelsMeta = meta.channelsMeta || {}
  const channelNames = Object.keys(allChannelsMeta)
  const resolvedName = channelName || channelNames[0] || ''
  const channelMeta = allChannelsMeta[resolvedName]

  if (!channelMeta) {
    return (
      <Center h="100%">
        <Text c="dimmed">No channels found.</Text>
      </Center>
    )
  }

  return (
    <PanelProvider>
      <ChannelPageInner
        channelName={resolvedName}
        channelMeta={channelMeta}
        allChannelsMeta={allChannelsMeta}
      />
    </PanelProvider>
  )
}
