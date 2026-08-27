import React, { useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { ListOrdered } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePanelContext } from '../../context/PanelContext'
import { useQueueItems, type QueueItem } from '../../hooks/useQueueItems'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'

export interface QueuesListPanelProps {
  /** Filters the rows from outside; omit to use the panel's own search input. */
  externalSearch?: string
  emptyHero?: React.ReactNode
}

/**
 * Every queue in the project as selectable rows. Mount anywhere under a
 * `ConsoleSurface` — it reads its own meta and opens the queue inspector.
 */
export const QueuesListPanel: React.FC<QueuesListPanelProps> = ({
  externalSearch,
  emptyHero,
}) => {
  const { openQueue } = usePanelContext()
  useLocale()
  const { items, loading } = useQueueItems()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
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
        header: 'Concurrency',
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
      searchPlaceholder={m.queues_search_placeholder()}
      externalSearch={externalSearch}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.handler?.toLowerCase().includes(q) ||
        false
      }
      emptyMessage={m.queues_empty_message()}
      emptyHero={emptyHero}
      loading={loading}
    />
  )
}
