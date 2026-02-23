import React, { Suspense, useMemo } from 'react'
import { Text, Center, Loader } from '@mantine/core'
import { Radio } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { ChannelPageClient } from '@/components/pages/ChannelPageClient'
import { PanelProvider } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'

interface ChannelEntry {
  name: string
  route: string
  handlerCount: number
  actionCount: number
  data: any
}

const HANDLER_KEYS = ['connect', 'disconnect', 'message'] as const

const COLUMNS = [
  {
    key: 'name',
    header: 'NAME',
    render: (ch: ChannelEntry) => (
      <>
        <Text fw={500} truncate>
          {ch.name}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {ch.route}
        </Text>
      </>
    ),
  },
  {
    key: 'handlers',
    header: 'HANDLERS',
    align: 'right' as const,
    render: (ch: ChannelEntry) => (
      <PikkuBadge type="dynamic" badge="handlers" value={ch.handlerCount} />
    ),
  },
  {
    key: 'actions',
    header: 'ACTIONS',
    align: 'right' as const,
    render: (ch: ChannelEntry) => (
      <PikkuBadge type="dynamic" badge="actions" value={ch.actionCount} />
    ),
  },
  {
    key: 'route',
    header: 'ROUTE',
    align: 'right' as const,
    render: (ch: ChannelEntry) => (
      <PikkuBadge type="dynamic" badge="route" value={ch.route} />
    ),
  },
]

const ChannelsList: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()
  const navigate = useNavigate()

  const channels = useMemo((): ChannelEntry[] => {
    return Object.entries(meta.channelsMeta || {}).map(([name, ch]) => {
      const data = ch as any
      const handlerCount = HANDLER_KEYS.filter((h) => data[h] != null).length
      const actionCount = Object.values(data.messageWirings || {}).reduce(
        (sum: number, actions: any) => sum + Object.keys(actions).length,
        0
      )
      return { name, route: data.route, handlerCount, actionCount, data }
    })
  }, [meta.channelsMeta])

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <DetailPageHeader
            icon={Radio}
            category="Channels"
            docsHref="https://pikkujs.com/docs/channels"
          />
        }
        hidePanel
      >
        <TableListPage
          title="Channels"
          icon={Radio}
          docsHref="https://pikkujs.com/docs/channels"
          data={channels}
          columns={COLUMNS}
          getKey={(ch) => ch.name}
          onRowClick={(ch) =>
            navigate(`/apis/channels?id=${encodeURIComponent(ch.name)}`)
          }
          searchPlaceholder="Search channels..."
          searchFilter={(ch, q) =>
            ch.name.toLowerCase().includes(q) ||
            ch.route.toLowerCase().includes(q)
          }
          emptyMessage="No channels found."
          loading={loading}
        />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}

const ChannelsPageInner: React.FunctionComponent = () => {
  const [searchParams] = useSearchParams()
  const channelId = searchParams.get('id')

  if (channelId) {
    return <ChannelPageClient />
  }

  return <ChannelsList />
}

export const ChannelsPage: React.FunctionComponent = () => {
  return (
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader />
        </Center>
      }
    >
      <ChannelsPageInner />
    </Suspense>
  )
}
