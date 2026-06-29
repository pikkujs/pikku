import React, { useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { ListOrdered } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { PikkuBadge } from '../components/ui/PikkuBadge'

interface QueueItem {
  name: string
  handler?: string
  concurrency?: number
  data: any
}

const QueuesTable: React.FC<{
  items: QueueItem[]
  loading?: boolean
}> = ({ items, loading }) => {
  const { openQueue } = usePanelContext()
  const { t } = useI18n()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: QueueItem) => (
          <>
            <Text fw={500} truncate>
              {asI18n(item.name)}
            </Text>
            {item.handler && (
              <Text size="sm" c="dimmed" truncate>
                {asI18n(item.handler)}
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
      docsHref="https://pikku.dev/docs/wiring/queue"
      data={items}
      columns={columns}
      getKey={(item) => item.name}
      onRowClick={(item) => openQueue(item.name, item.data)}
      searchPlaceholder={t('queues.search_placeholder')}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.handler?.toLowerCase().includes(q) ||
        false
      }
      emptyMessage={t('queues.empty_message')}
      loading={loading}
    />
  )
}

export const QueuesPage: React.FC = () => {
  const { meta, loading } = usePikkuMeta()
  const { t } = useI18n()

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
        header={<ListPageHeader title={t('queues.title')} description={t('queues.description')} />}
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={t('queues.select_item')}
      >
        <QueuesTable items={items} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
