import React, { useMemo } from 'react'
import { Text } from '@mantine/core'
import { Clock } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { usePanelContext } from '@/context/PanelContext'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'

interface SchedulerItem {
  name: string
  handler?: string
  schedule?: string
  data: any
}

export const SchedulersTab: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()
  const { openScheduler } = usePanelContext()

  const items = useMemo((): SchedulerItem[] => {
    if (!meta.schedulerMeta) return []
    return Object.entries(meta.schedulerMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        handler: data.pikkuFuncId,
        schedule: data.schedule,
        data,
      })
    )
  }, [meta.schedulerMeta])

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: SchedulerItem) => (
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
        key: 'schedule',
        header: 'SCHEDULE',
        align: 'right' as const,
        render: (item: SchedulerItem) =>
          item.schedule ? (
            <PikkuBadge type="dynamic" badge="schedule" value={item.schedule} />
          ) : null,
      },
    ],
    []
  )

  return (
    <TableListPage
      title="Schedulers"
      icon={Clock}
      docsHref="https://pikku.dev/docs/wiring/scheduled-tasks"
      data={items}
      columns={columns}
      getKey={(item) => item.name}
      onRowClick={(item) => openScheduler(item.name, item.data)}
      searchPlaceholder="Search scheduled tasks..."
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.handler?.toLowerCase().includes(q) ||
        item.schedule?.toLowerCase().includes(q) ||
        false
      }
      emptyMessage="No scheduled tasks found."
      loading={loading}
    />
  )
}
