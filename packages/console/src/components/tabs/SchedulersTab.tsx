import React, { useMemo } from 'react'
import { Text, Badge, Group } from '@pikku/mantine/core'
import { Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { TableListPage } from '../layout/TableListPage'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

type RunEntry = {
  timestamp: number
  status: 'completed' | 'failed'
  durationSeconds: number | null
  error: string | null
}
type SchedulerHistory = Record<
  string,
  { lastRun: RunEntry | null; history: RunEntry[] }
>

const CronBadges: React.FC<{ schedule: string }> = ({ schedule }) => {
  const parts = schedule.split(' ')
  return (
    <Group gap={3} wrap="nowrap">
      {parts.map((part, i) => (
        <Badge
          key={i}
          size="sm"
          ff="monospace"
          tt="none"
          style={{
            background: 'rgba(245,158,11,0.08)',
            border: '0.5px solid transparent',
            color: '#fbbf24',
            padding: '1px 5px',
          }}
        >
          {asI18n(part)}
        </Badge>
      ))}
    </Group>
  )
}

const fmtRelative = (ts: number): string => {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export const SchedulersTab: React.FC<{
  searchQuery: string
  emptyHero?: React.ReactNode
}> = ({ searchQuery, emptyHero }) => {
  const { meta } = usePikkuMeta()
  const rpc = usePikkuRPC()
  useLocale()
  const { openScheduler } = usePanelContext()

  const { data: history = {} } = useQuery<SchedulerHistory>({
    queryKey: ['console:getSchedulerHistory'],
    queryFn: () =>
      (rpc.invoke as (name: string) => Promise<unknown>)(
        'console:getSchedulerHistory'
      ).then((r) => (r ?? {}) as SchedulerHistory),
    refetchInterval: 15000,
  })

  const allItems = useMemo(() => {
    if (!meta.schedulerMeta) return []
    return Object.entries(meta.schedulerMeta).map(
      ([name, data]: [string, any]) => ({ name, ...data })
    )
  }, [meta.schedulerMeta])

  const items = useMemo(() => {
    if (!searchQuery) return allItems
    const q = searchQuery.toLowerCase()
    return allItems.filter(
      (item: any) =>
        item.name?.toLowerCase().includes(q) ||
        item.pikkuFuncId?.toLowerCase().includes(q) ||
        item.schedule?.toLowerCase().includes(q)
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
                {item.pikkuFuncId}()
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'schedule',
        header: 'SCHEDULE',
        render: (item: any) =>
          item.schedule ? <CronBadges schedule={item.schedule} /> : null,
      },
      {
        key: 'lastRun',
        header: 'LAST RUN',
        width: 120,
        render: (item: any) => {
          const taskName = item.wireId || item.name
          const lastRun = history[taskName]?.lastRun ?? null
          if (!lastRun) {
            return (
              <Text size="xs" ff="monospace" c="var(--app-meta-label)">
                {asI18n('—')}
              </Text>
            )
          }
          return (
            <>
              <Text
                size="xs"
                ff="monospace"
                c={
                  lastRun.status === 'failed'
                    ? 'var(--mantine-color-red-5)'
                    : 'var(--mantine-color-green-5)'
                }
              >
                {asI18n(lastRun.status)}
              </Text>
              <Text size="xs" ff="monospace" c="var(--app-text-muted)">
                {asI18n(fmtRelative(lastRun.timestamp))}
              </Text>
            </>
          )
        },
      },
    ],
    [history]
  )

  return (
    <TableListPage
      title="Schedulers"
      icon={Clock}
      docsHref="https://pikku.dev/docs/wiring/scheduled-tasks"
      data={items}
      columns={columns}
      getKey={(item) => item.name}
      onRowClick={(item) => openScheduler(item.wireId || item.name, item)}
      emptyMessage={m.schedulers_empty_message()}
      emptyHero={emptyHero}
    />
  )
}
