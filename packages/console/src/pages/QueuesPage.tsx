import React, { useMemo } from 'react'
import { Text } from '@mantine/core'
import { ListOrdered } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'

interface QueueItem {
  name: string
  handler?: string
  concurrency?: number
  data: any
}

const QueuesTable: React.FunctionComponent<{
  items: QueueItem[]
  loading?: boolean
}> = ({ items, loading }) => {
  const { openQueue } = usePanelContext()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: QueueItem) => (
          <>
            <Text fw={500} truncate>
              {item.name}
            </Text>
            {item.handler && (
              <Text size="xs" c="dimmed" truncate>
                {item.handler}
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'concurrency',
        header: 'CONCURRENCY',
        align: 'right' as const,
        render: (item: QueueItem) =>
          item.concurrency ? (
            <PikkuBadge
              type="dynamic"
              badge="concurrency"
              value={item.concurrency}
            />
          ) : null,
      },
    ],
    []
  )

  return (
    <TableListPage
      title="Queues"
      icon={ListOrdered}
      docsHref="https://pikkujs.com/docs/queues"
      data={items}
      columns={columns}
      getKey={(item) => item.name}
      onRowClick={(item) => openQueue(item.name, item.data)}
      searchPlaceholder="Search queue workers..."
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.handler?.toLowerCase().includes(q) ||
        false
      }
      emptyMessage="No queue workers found."
      loading={loading}
    />
  )
}

export const QueuesPage: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo((): QueueItem[] => {
    if (!meta.queueMeta) return []
    return Object.entries(meta.queueMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        handler: data.pikkuFuncId,
        concurrency: data.concurrency,
        data,
      })
    )
  }, [meta.queueMeta])

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <DetailPageHeader
            icon={ListOrdered}
            category="Queues"
            docsHref="https://pikkujs.com/docs/queues"
          />
        }
        showTabs={false}
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage="Select a queue worker to view its details"
      >
        <QueuesTable items={items} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
