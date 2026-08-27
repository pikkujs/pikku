import React, { useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { Clock } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import {
  useSchedulerItems,
  type SchedulerItem,
} from '../../hooks/useSchedulerItems'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'

export interface SchedulersListPanelProps {
  /** Filters the rows from outside; omit to use the panel's own search input. */
  externalSearch?: string
  emptyHero?: React.ReactNode
}

/**
 * Every scheduled task in the project as selectable rows. Mount anywhere under
 * a `ConsoleSurface` — it reads its own meta and opens the scheduler inspector.
 */
export const SchedulersListPanel: React.FC<SchedulersListPanelProps> = ({
  externalSearch,
  emptyHero,
}) => {
  const { openScheduler } = usePanelContext()
  useLocale()
  const { items, loading } = useSchedulerItems()

  usePanelUrl({
    type: 'scheduler',
    items,
    getId: (item) => item.name,
    open: (id, item) => openScheduler(id, item.data),
  })

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
      searchPlaceholder={m.schedulers_search_placeholder()}
      externalSearch={externalSearch}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.handler?.toLowerCase().includes(q) ||
        item.schedule?.toLowerCase().includes(q) ||
        false
      }
      emptyMessage={m.schedulers_empty_message()}
      emptyHero={emptyHero}
      loading={loading}
    />
  )
}
