import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Box, Center, Text } from '@mantine/core'
import { Radio } from 'lucide-react'
import { PanelProvider } from '@/context/PanelContext'
import { usePanelContext } from '@/context/PanelContext'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { useFunctionMeta } from '@/hooks/useWirings'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import {
  ChannelNavTree,
  type ChannelSelection,
} from '@/components/channel/ChannelNavTree'
import { ChannelDetailView } from '@/components/channel/ChannelDetailView'
import type { ChannelMeta } from '@pikku/core/channel'

const getSelectedFuncId = (
  channel: ChannelMeta,
  selected: ChannelSelection
): string | null => {
  if (!selected) return null
  if (selected.type === 'handler') {
    return (
      channel[selected.handler as 'connect' | 'disconnect' | 'message']
        ?.pikkuFuncId ?? null
    )
  }
  return (
    channel.messageWirings?.[selected.category]?.[selected.action]
      ?.pikkuFuncId ?? null
  )
}

const ChannelPageInner: React.FunctionComponent<{
  channelName: string
  channelMeta: ChannelMeta
  channelItems: { name: string; description?: string }[]
}> = ({ channelName, channelMeta, channelItems }) => {
  const navigate = useNavigate()
  const { openFunction } = usePanelContext()

  const [selected, setSelected] = useState<ChannelSelection>(null)

  const pikkuFuncId = getSelectedFuncId(channelMeta, selected)
  const { data: funcMeta } = useFunctionMeta(pikkuFuncId ?? '')

  useEffect(() => {
    if (pikkuFuncId && funcMeta) {
      openFunction(pikkuFuncId, funcMeta)
    }
  }, [pikkuFuncId, funcMeta, openFunction])

  const handleChannelSwitch = useCallback(
    (name: string) => {
      setSelected(null)
      navigate(`/apis/channels?id=${encodeURIComponent(name)}`)
    },
    [navigate]
  )

  return (
    <ResizablePanelLayout
      header={
        <DetailPageHeader
          icon={Radio}
          category="Channels"
          categoryPath="/apis/channels"
          currentItem={channelName}
          items={channelItems}
          onItemSelect={handleChannelSwitch}
          docsHref="https://pikkujs.com/docs/channels"
        />
      }
    >
      <Box style={{ display: 'flex', height: '100%' }}>
        <Box
          style={{
            width: 260,
            minWidth: 200,
            borderRight: '1px solid var(--mantine-color-default-border)',
            height: '100%',
          }}
        >
          <ChannelNavTree
            channel={channelMeta}
            selected={selected}
            onSelect={setSelected}
          />
        </Box>
        <Box style={{ flex: 1, overflow: 'hidden' }}>
          <ChannelDetailView
            channelName={channelName}
            channel={channelMeta}
            selected={selected}
          />
        </Box>
      </Box>
    </ResizablePanelLayout>
  )
}

export const ChannelPageClient: React.FunctionComponent = () => {
  const [searchParams] = useSearchParams()
  const channelName = searchParams.get('id') || ''
  const { meta } = usePikkuMeta()

  const channelMeta = meta.channelsMeta?.[channelName]

  const channelItems = useMemo(() => {
    if (!meta.channelsMeta) return []
    return Object.entries(meta.channelsMeta).map(
      ([name, ch]: [string, any]) => ({
        name,
        description: ch.route,
      })
    )
  }, [meta.channelsMeta])

  if (!channelMeta) {
    return (
      <Center h="100vh">
        <Text c="dimmed">Channel &quot;{channelName}&quot; not found.</Text>
      </Center>
    )
  }

  return (
    <PanelProvider>
      <ChannelPageInner
        channelName={channelName}
        channelMeta={channelMeta}
        channelItems={channelItems}
      />
    </PanelProvider>
  )
}
