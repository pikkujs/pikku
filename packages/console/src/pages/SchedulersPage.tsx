import React, { useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { Clock } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { PikkuBadge } from '../components/ui/PikkuBadge'

interface SchedulerItem {
  name: string
  handler?: string
  schedule?: string
  data: any
}

const SchedulersTable: React.FC<{
  items: SchedulerItem[]
  loading?: boolean
}> = ({ items, loading }) => {
  const { openScheduler } = usePanelContext()
  const { t } = useI18n()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: SchedulerItem) => (
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
      searchPlaceholder={t('schedulers.search_placeholder')}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.handler?.toLowerCase().includes(q) ||
        item.schedule?.toLowerCase().includes(q) ||
        false
      }
      emptyMessage={t('schedulers.empty_message')}
      loading={loading}
    />
  )
}

export const SchedulersPage: React.FC = () => {
  const { meta, loading } = usePikkuMeta()
  const { t } = useI18n()

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

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={<ListPageHeader title={t('schedulers.title')} description={t('schedulers.description')} />}
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={t('schedulers.select_item')}
      >
        <SchedulersTable items={items} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
