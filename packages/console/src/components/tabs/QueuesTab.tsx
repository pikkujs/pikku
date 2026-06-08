import React, { useMemo } from 'react'
import { Text } from '@mantine/core'
import { ListOrdered } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { TableListPage } from '../layout/TableListPage'

type QueueDepths = Record<
  string,
  { queued: number; active: number; failed: number }
>

export const QueuesTab: React.FC<{
  searchQuery: string
  emptyHero?: React.ReactNode
}> = ({ searchQuery, emptyHero }) => {
  const { meta } = usePikkuMeta()
  const rpc = usePikkuRPC()
  const { openQueue } = usePanelContext()

  const { data: depths } = useQuery<QueueDepths>({
    queryKey: ['console:getQueueDepths'],
    queryFn: () =>
      (rpc.invoke as (name: string) => Promise<unknown>)(
        'console:getQueueDepths'
      ).then((r) => (r ?? {}) as QueueDepths),
    refetchInterval: 5000,
  })

  const allItems = useMemo(() => {
    if (!meta.queueMeta) return []
    return Object.entries(meta.queueMeta).map(
      ([name, data]: [string, any]) => ({ name, ...data })
    )
  }, [meta.queueMeta])

  const items = useMemo(() => {
    if (!searchQuery) return allItems
    const q = searchQuery.toLowerCase()
    return allItems.filter(
      (item: any) =>
        item.name?.toLowerCase().includes(q) ||
        item.wireId?.toLowerCase().includes(q) ||
        item.pikkuFuncId?.toLowerCase().includes(q)
    )
  }, [allItems, searchQuery])

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: any) => (
          <>
            <Text fw={500} ff="monospace" truncate>
              {item.wireId || item.name}
            </Text>
            {item.pikkuFuncId && (
              <Text size="xs" c="dimmed" ff="monospace" truncate>
                {item.pikkuFuncId}
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'queued',
        header: 'QUEUED',
        width: 80,
        render: (item: any) => {
          const depth = depths?.[item.wireId || item.name]
          return (
            <Text
              size="sm"
              ff="monospace"
              c={depth?.queued ? 'var(--app-meta-value)' : 'var(--app-meta-label)'}
            >
              {depth?.queued ?? '—'}
            </Text>
          )
        },
      },
      {
        key: 'active',
        header: 'ACTIVE',
        width: 80,
        render: (item: any) => {
          const depth = depths?.[item.wireId || item.name]
          return (
            <Text
              size="sm"
              ff="monospace"
              c={depth?.active ? 'var(--mantine-color-green-5)' : 'var(--app-meta-label)'}
            >
              {depth?.active ?? '—'}
            </Text>
          )
        },
      },
      {
        key: 'failed',
        header: 'FAILED',
        width: 80,
        render: (item: any) => {
          const depth = depths?.[item.wireId || item.name]
          return (
            <Text
              size="sm"
              ff="monospace"
              c={depth?.failed ? 'var(--mantine-color-red-5)' : 'var(--app-meta-label)'}
            >
              {depth?.failed ?? '—'}
            </Text>
          )
        },
      },
    ],
    [depths]
  )

  return (
    <TableListPage
      title="Queues"
      icon={ListOrdered}
      docsHref="https://pikku.dev/docs/wiring/queues"
      data={items}
      columns={columns}
      getKey={(item) => item.name}
      onRowClick={(item) => openQueue(item.wireId || item.name, item)}
      emptyMessage="No queue workers found."
      emptyHero={emptyHero}
    />
  )
}
