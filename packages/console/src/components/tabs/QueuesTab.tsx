import React, { useMemo } from 'react'
import { Text } from '@mantine/core'
import { ListOrdered } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'

interface QueueItem {
  name: string
  handler?: string
  concurrency?: number
  data: any
}

export const QueuesTab: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()
  const { openQueue } = usePanelContext()

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
      docsHref="https://pikku.dev/docs/wiring/queue"
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
